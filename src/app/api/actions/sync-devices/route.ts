import { NextRequest, NextResponse } from "next/server";
import { getStoreConfig } from "@/lib/config";
import {
  listBitableRecords,
  batchCreateBitableRecords,
  batchDeleteBitableRecords,
} from "@/lib/feishu";

/**
 * POST /api/actions/sync-devices
 * 
 * 以设备表为主数据，同步库存表：
 * - 设备表有、库存表没有 → 新增库存记录（默认状态：南通仓）
 * - 库存表有、设备表没有 → 删除库存记录
 * - 两边都有的 → 不动
 */
export async function POST(
  request: NextRequest
) {
  const { searchParams } = request.nextUrl;
  const storeId = searchParams.get("store") || "default";
  const store = getStoreConfig(storeId);

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // 【诊断日志】确认当前操作的店铺和表
  console.log("[sync-devices] ====== 同步库存启动 ======");
  console.log("[sync-devices] storeId:", storeId);
  console.log("[sync-devices] 店铺名称:", store.name);
  console.log("[sync-devices] 设备表ID:", store.tables.device);
  console.log("[sync-devices] 库存表ID:", store.tables.inventory);
  console.log("[sync-devices] ===============================");

  const deviceTableId = store.tables.device;
  const inventoryTableId = store.tables.inventory;

  try {
    // 1. 获取设备表全部记录（分页遍历）
    const deviceSNs = new Map<string, { model: string; category: string }>();
    let deviceToken: string | undefined;
    do {
      const result = await listBitableRecords(store.base_token, deviceTableId, {
        page_size: 100,
        page_token: deviceToken,
      });
      for (const item of result.items) {
        const sn = extractStringField(item["SN编码"]);
        if (sn) {
          deviceSNs.set(sn, {
            model: extractStringField(item["设备型号"]),
            category: extractStringField(item["分类"]),
          });
        }
      }
      deviceToken = result.has_more ? result.page_token : undefined;
    } while (deviceToken);

    // 2. 获取库存表全部记录（分页遍历）
    const inventoryMap = new Map<string, string[]>(); // SN → record_id[]（可能有重复SN）
    let totalInventoryRecords = 0;
    let invToken: string | undefined;
    do {
      const result = await listBitableRecords(store.base_token, inventoryTableId, {
        page_size: 100,
        page_token: invToken,
      });
      for (const item of result.items) {
        const sn = extractStringField(item["SN编码"]);
        const recordId = item._record_id ? String(item._record_id) : "";
        totalInventoryRecords++;
        if (sn && recordId) {
          const existing = inventoryMap.get(sn);
          if (existing) {
            existing.push(recordId);
          } else {
            inventoryMap.set(sn, [recordId]);
          }
        }
      }
      invToken = result.has_more ? result.page_token : undefined;
    } while (invToken);

    // 3. 比较差异
    const toAdd: { sn: string; model: string; category: string }[] = [];
    const toDeleteIds: string[] = [];

    // 设备表有但库存表没有 → 新增
    for (const [sn, info] of deviceSNs) {
      if (!inventoryMap.has(sn)) {
        toAdd.push({ sn, model: info.model, category: info.category });
      }
    }

    // 库存表有但设备表没有 → 全部删除
    // 设备表有但库存有多条重复 → 只保留1条，其余删除
    for (const [sn, recordIds] of inventoryMap) {
      if (!deviceSNs.has(sn)) {
        // 设备表没有这个SN → 删除所有库存记录
        toDeleteIds.push(...recordIds);
      } else if (recordIds.length > 1) {
        // 有重复SN → 只保留第一条，删除其余的
        toDeleteIds.push(...recordIds.slice(1));
      }
    }

    // 4. 执行操作
    let added = 0;
    let deleted = 0;

    if (toAdd.length > 0) {
      const records = toAdd.map(({ sn, model, category }) => ({
        fields: {
          SN编码: sn,
          设备型号: model || "",
          分类: category || "",
          状态: ["南通仓"],
        },
      }));
      await batchCreateBitableRecords(store.base_token, inventoryTableId, records);
      added = toAdd.length;
      console.log(`[sync-devices] 新增 ${added} 条库存记录`);
    }

    if (toDeleteIds.length > 0) {
      await batchDeleteBitableRecords(store.base_token, inventoryTableId, toDeleteIds);
      deleted = toDeleteIds.length;
      console.log(`[sync-devices] 删除 ${deleted} 条库存记录`);
    }

    const unchanged = deviceSNs.size - added;
    const duplicateSNs = Array.from(inventoryMap.values()).filter(ids => ids.length > 1).length;

    return NextResponse.json({
      success: true,
      added,
      deleted,
      unchanged,
      total_devices: deviceSNs.size,
      total_inventory: totalInventoryRecords,
      inventory_unique_sns: inventoryMap.size,
      duplicate_sn_count: duplicateSNs,
    });
  } catch (error: any) {
    console.error("[sync-devices] 同步失败:", error);
    return NextResponse.json(
      { error: "同步失败", detail: error.message },
      { status: 500 }
    );
  }
}

/** 从飞书字段值中提取字符串 */
function extractStringField(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : String(v)))
      .join("")
      .trim();
  }
  return String(value).trim();
}
