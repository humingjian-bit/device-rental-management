/**
 * 同步引擎
 * 订单同步主流程
 */

import { getParser } from "../platforms";
import { listBitableRecords, searchBitableRecords, batchCreateBitableRecords, batchUpdateRecords, updateBitableRecord } from "../feishu";
import { SyncOrder, SyncResult, SyncStats, SyncLogEntry } from "./types";
import { getStoreConfig } from "../config";

/**
 * 同步引擎
 */
export class SyncEngine {
  private storeId: string;
  private platformId: string;
  private orders: SyncOrder[] = [];
  private logs: SyncLogEntry[] = [];
  private stats: SyncStats = {
    created: 0,
    updated: 0,
    skipped: 0,
    skipped_reasons: [],
    inventory_updated: 0,
    inventory_failed: 0,
    errors: [],
  };

  constructor(storeId: string, platformId: string) {
    this.storeId = storeId;
    this.platformId = platformId;
  }

  /**
   * 添加日志
   */
  private addLog(level: SyncLogEntry["level"], message: string) {
    const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    this.logs.push({ level, message, timestamp });
    console.log(`[${level}] ${message}`);
  }

  /**
   * 执行同步
   */
  async run(fileContent: string | Buffer): Promise<SyncResult> {
    const store = getStoreConfig(this.storeId);
    if (!store) {
      this.addLog("ERROR", `店铺配置不存在: ${this.storeId}`);
      return this.getResult(false);
    }

    try {
      // Step 1: 解析文件
      this.addLog("INFO", `${this.getPlatformName()}: 开始解析文件...`);
      const parser = getParser(this.platformId);
      if (!parser) {
        this.addLog("ERROR", `不支持的平台: ${this.platformId}`);
        return this.getResult(false);
      }

      this.orders = parser.parse(fileContent);
      if (this.orders.length === 0) {
        this.addLog("WARNING", "解析结果为空");
        return this.getResult(true);
      }

      this.addLog("INFO", `解析完成，共${this.orders.length}条订单`);

      // Step 2: 过滤长租订单
      const originalCount = this.orders.length;
      this.orders = this.orders.filter((order) => {
        if (order.rental_days && order.rental_days > 90) {
          this.stats.skipped++;
          this.stats.skipped_reasons.push(`订单${order.order_no}租期${order.rental_days}天>90天`);
          return false;
        }
        return true;
      });

      if (this.stats.skipped > 0) {
        this.addLog("WARNING", `跳过${this.stats.skipped}条长租订单`);
      }

      // Step 3: 云端过滤查询（查找已存在的订单）
      this.addLog("INFO", "正在查询已有订单...");
      const existingOrders = await this.queryExistingOrders(store.base_token, store.tables.order);
      this.addLog("INFO", `已有订单${existingOrders.size}条`);

      // Step 4: 分拣新增/更新，跳过取消状态的订单
      const toCreate: SyncOrder[] = [];
      const toUpdate: { order: SyncOrder; record_id: string }[] = [];
      const CANCEL_STATUSES = ["订单关闭（商家）", "订单关闭（系统）", "订单关闭（用户）", "取消"];

      for (const order of this.orders) {
        // 跳过取消状态的订单（新增时跳过，更新时仍处理）
        const isCanceled = CANCEL_STATUSES.includes(order.raw_status || "") || order.status === "取消";
        if (isCanceled) {
          this.stats.skipped++;
          this.stats.skipped_reasons.push(`订单${order.order_no}已取消`);
          continue;
        }

        const existing = existingOrders.get(order.order_no);
        if (existing) {
          toUpdate.push({ order, record_id: existing.record_id });
        } else {
          toCreate.push(order);
        }
      }

      this.addLog("INFO", `新增${toCreate.length}条，更新${toUpdate.length}条`);

      // Step 5: 批量写入
      if (toCreate.length > 0) {
        const created = await this.createOrders(store.base_token, store.tables.order, toCreate);
        this.stats.created = created;
        this.addLog("INFO", `新增完成: ${created}条`);
      }

      if (toUpdate.length > 0) {
        const updated = await this.updateOrders(store.base_token, store.tables.order, toUpdate);
        this.stats.updated = updated;
        this.addLog("INFO", `更新完成: ${updated}条`);
      }

      // Step 6: 库存联动（只处理更新和新增值中有SN的）
      this.addLog("INFO", "开始库存联动...");
      const allProcessedOrders = [
        ...toCreate.map((o) => ({ order: o, record_id: "" })),
        ...toUpdate,
      ].filter((item) => item.order.sn_code);

      for (const item of allProcessedOrders) {
        await this.syncInventoryStatus(store, item.order, item.record_id);
      }

      this.addLog("INFO", `库存更新: ${this.stats.inventory_updated}条成功, ${this.stats.inventory_failed}条失败`);
      this.addLog("INFO", "✅ 同步完成");

      return this.getResult(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.addLog("ERROR", `同步失败: ${message}`);
      this.stats.errors.push(message);
      return this.getResult(false);
    }
  }

  /**
   * 获取平台名称
   */
  private getPlatformName(): string {
    const platformNames: Record<string, string> = {
      renrenzu: "人人租",
      huizu: "惠租",
      huizu_renewal: "惠租续租",
      youpinzu: "优品租",
      chenglin: "诚赁",
    };
    return platformNames[this.platformId] || this.platformId;
  }

  /**
   * 云端过滤查询已有订单
   */
  private async queryExistingOrders(
    baseToken: string,
    orderTableId: string
  ): Promise<Map<string, { record_id: string; sn_record_id?: string }>> {
    const result = new Map<string, { record_id: string; sn_record_id?: string }>();
    const orderNos = this.orders.map((o) => o.order_no);

    // 飞书 filter API 每次最多 50 个条件
    const BATCH_SIZE = 50;

    for (let i = 0; i < orderNos.length; i += BATCH_SIZE) {
      const batch = orderNos.slice(i, i + BATCH_SIZE);

      try {
        const searchResult = await searchBitableRecords(baseToken, orderTableId, {
          filter: {
            conjunction: "or",
            conditions: batch.map((no) => ({
              field_name: "订单号",
              operator: "is",
              value: [no],
            })),
          },
          field_names: ["订单号", "SN编码（最最重要）"],
        });

        const records = searchResult.items || [];

        for (const record of records as Array<{ record_id: string; fields?: Record<string, unknown> }>) {
          const orderNo = record.fields?.["订单号"];
          if (orderNo) {
            const snField = record.fields?.["SN编码（最最重要）"] as { link_record_ids?: string[] } | undefined;
            result.set(String(orderNo), {
              record_id: record.record_id,
              sn_record_id: snField?.link_record_ids?.[0],
            });
          }
        }
      } catch (error) {
        console.error("[SyncEngine] 云端过滤查询失败:", error);
        // 查询失败时继续尝试其他批次
      }
    }

    return result;
  }

  /**
   * 批量创建订单
   */
  private async createOrders(
    baseToken: string,
    tableId: string,
    orders: SyncOrder[]
  ): Promise<number> {
    // 构建符合飞书 API 格式的数据: [{ fields: {...} }, ...]
    const records = orders.map((order) => ({ fields: this.orderToFields(order, true) }));
    const BATCH_SIZE = 500;

    let total = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      try {
        const result = await batchCreateBitableRecords(baseToken, tableId, batch);
        total += result.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.stats.errors.push(`批量新增失败: ${message}`);
        this.addLog("ERROR", `批量新增失败: ${message}`);
      }
    }

    return total;
  }

  /**
   * 批量更新订单
   */
  private async updateOrders(
    baseToken: string,
    tableId: string,
    orders: { order: SyncOrder; record_id: string }[]
  ): Promise<number> {
    const records: { record_id: string; fields: Record<string, unknown> }[] = orders.map(({ order, record_id }) => ({
      record_id,
      fields: this.orderToFields(order, false),
    }));

    const BATCH_SIZE = 500;
    let total = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      try {
        const result = await batchUpdateRecords(baseToken, tableId, batch);
        total += result.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.stats.errors.push(`批量更新失败: ${message}`);
        this.addLog("ERROR", `批量更新失败: ${message}`);
      }
    }

    return total;
  }

  /**
   * 订单转飞书字段
   */
  private orderToFields(order: SyncOrder, isNew: boolean): Record<string, unknown> {
    const fields: Record<string, unknown> = {};

    // 基础字段
    if (order.order_no) fields["订单号"] = order.order_no;
    if (order.customer_name) fields["姓名"] = order.customer_name;
    if (order.phone) fields["手机号码"] = order.phone;
    if (order.device_model) fields["租机型号"] = order.device_model;
    if (order.package) fields["套餐"] = order.package;
    if (order.remark) fields["备注"] = order.remark;
    if (order.rental_days) fields["租期（天）"] = order.rental_days;
    if (order.rental_fee) fields["租金"] = order.rental_fee;
    if (order.express_settlement) fields["快递结算方式"] = order.express_settlement;

    // 平台名称
    const platformNames: Record<string, string> = {
      renrenzu: "人人租",
      huizu: "惠租",
      huizu_renewal: "惠租续租",
      youpinzu: "优品租",
      chenglin: "诚赁",
    };
    if (order.platform_id) fields["发货平台"] = platformNames[order.platform_id] || order.platform_id;

    // 日期字段（转为时间戳）
    if (order.ship_date) fields["发货日期"] = order.ship_date.getTime();
    if (order.estimated_return_date) fields["归还日期（预估）"] = order.estimated_return_date.getTime();

    // 只在新增时写入实际发货日期
    if (isNew && order.actual_ship_date) {
      fields["实际发货日期"] = order.actual_ship_date.getTime();
    }

    // 状态
    if (order.status) fields["状态"] = order.status;

    return fields;
  }

  /**
   * 库存联动
   */
  private async syncInventoryStatus(
    store: NonNullable<ReturnType<typeof getStoreConfig>>,
    order: SyncOrder,
    orderRecordId: string
  ) {
    if (!order.sn_code) {
      this.stats.skipped++;
      this.stats.skipped_reasons.push(`订单${order.order_no}无SN编码`);
      return;
    }

    try {
      // 通过 SN 编码查询库存记录
      const inventorySearchResult = await searchBitableRecords(store.base_token, store.tables.inventory, {
        filter: {
          conjunction: "and",
          conditions: [
            {
              field_name: "SN编码",
              operator: "contains",
              value: [order.sn_code],
            },
          ],
        },
        field_names: ["SN编码", "状态"],
      });

      const inventoryRecords = inventorySearchResult.items || [];
      const typedInventoryRecords = inventoryRecords as Array<{ record_id: string; fields?: Record<string, unknown> }>;

      if (typedInventoryRecords.length === 0) {
        this.stats.skipped++;
        this.stats.skipped_reasons.push(`订单${order.order_no}的SN${order.sn_code}未找到库存记录`);
        return;
      }

      const inventoryRecord = typedInventoryRecords[0];
      const inventoryRecordId = inventoryRecord.record_id;

      // 判断是否最新订单
      const isLatestOrder = await this.isLatestOrder(store, order, inventoryRecordId);
      if (!isLatestOrder) {
        this.stats.skipped++;
        this.stats.skipped_reasons.push(`订单${order.order_no}非最新订单，跳过库存更新`);
        return;
      }

      // 映射库存状态
      const newInventoryStatus = this.mapOrderStatusToInventory(order.status, order.raw_status);
      if (newInventoryStatus) {
        await updateBitableRecord(store.base_token, store.tables.inventory, inventoryRecordId, {
          "状态": newInventoryStatus,
        });
        this.stats.inventory_updated++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.stats.inventory_failed++;
      this.stats.errors.push(`库存更新失败[${order.order_no}]: ${message}`);
      this.addLog("ERROR", `库存更新失败[${order.order_no}]: ${message}`);
    }
  }

  /**
   * 判断是否为最新订单
   */
  private async isLatestOrder(
    store: NonNullable<ReturnType<typeof getStoreConfig>>,
    order: SyncOrder,
    inventoryRecordId: string
  ): Promise<boolean> {
    try {
      // 查询该设备的所有订单，按实际发货日期排序
      const searchResult = await searchBitableRecords(store.base_token, store.tables.order, {
        filter: {
          conjunction: "and",
          conditions: [
            {
              field_name: "SN编码（最最重要）",
              operator: "contains",
              value: [order.sn_code!],
            },
          ],
        },
        field_names: ["订单号", "实际发货日期"],
        sort: "实际发货日期:desc",
        page_size: 1,
      });

      const records = searchResult.items || [];
      const typedRecords = records as Array<{ record_id: string; fields?: Record<string, unknown> }>;

      if (typedRecords.length === 0) {
        return true; // 没有其他订单，当前就是最新的
      }

      const latestOrderNo = typedRecords[0].fields?.["订单号"];
      return latestOrderNo === order.order_no;
    } catch (error) {
      console.error("[SyncEngine] 判断最新订单失败:", error);
      return true; // 查询失败时放行
    }
  }

  /**
   * 订单状态映射到库存状态
   */
  private mapOrderStatusToInventory(
    status: string | undefined,
    rawStatus: string | undefined
  ): string | null {
    // 进行中状态 → 出租
    const RENTAL_STATUSES = ["待归还", "待收货", "归还中"];
    if (RENTAL_STATUSES.includes(rawStatus || "")) {
      return "出租";
    }

    // 以下状态 → 南通仓
    const WAREHOUSE_STATUSES = ["待发货", "订单关闭", "交易完成", "已完结", "退款", "取消"];
    if (WAREHOUSE_STATUSES.includes(status || "") || WAREHOUSE_STATUSES.includes(rawStatus || "")) {
      return "南通仓";
    }

    return null;
  }

  /**
   * 获取结果
   */
  private getResult(success: boolean): SyncResult {
    return {
      success,
      stats: { ...this.stats },
      logs: [...this.logs],
    };
  }
}
