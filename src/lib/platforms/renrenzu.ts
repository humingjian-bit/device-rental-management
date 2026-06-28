/**
 * 人人租 CSV 解析器
 * 格式：GBK 编码 CSV
 * 参考 Python 原版逻辑实现
 */

import { SyncOrder, ParseResult } from "../sync/types";

/**
 * 人人租解析器
 */
export class RenrenzuParser {
  private logs: string[] = [];

  private log(msg: string) {
    this.logs.push(`[RenrenzuParser] ${msg}`);
    console.log(`[RenrenzuParser] ${msg}`);
  }

  /**
   * 解析人人租 CSV 文件
   * @param content CSV 文件内容（GBK编码）
   * @returns 解析结果
   */
  parse(content: string): ParseResult {
    this.logs = [];
    const orders: SyncOrder[] = [];

    // 移除 BOM 头
    const cleanContent = content.replace(/^\uFEFF/, "");
    this.log(`原始内容长度: ${content.length}, 清理后: ${cleanContent.length}`);
    const lines = cleanContent.trim().split("\n");
    this.log(`split后行数: ${lines.length}`);

    if (lines.length < 2) {
      this.log("数据不足（少于2行），无法解析");
      return { orders, logs: this.logs };
    }

    // 解析表头（第一行）
    const headers = this.parseCSVLine(lines[0]);
    this.log(`表头列名 (${headers.length} 列): ${headers.join(" | ")}`);

    // 找到各列索引
    const colMap = this.getColumnMap(headers);
    this.log(`列映射: ${JSON.stringify(colMap)}`);

    // 跳过第一行（表头），解析数据行
    this.log(`数据行数: ${lines.length - 1}`);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // 跳过空行
      try {
        const order = this.parseRow(line, colMap, i + 1);
        if (order) {
          orders.push(order);
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        this.log(`解析第${i + 1}行异常: ${errMsg}`);
      }
    }

    this.log(`解析完成，有效订单 ${orders.length} 条（共 ${lines.length - 1} 行数据）`);
    return { orders, logs: this.logs };
  }

  /**
   * 解析单行CSV（标准RFC 4180格式）
   * - 引号内逗号不分割
   * - 双引号表示转义引号
   * - 引号不在结果中保留
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes) {
          // 引号内遇到引号：检查是否是转义引号（双引号""）
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // 跳过下一个引号
          } else {
            inQuotes = false; // 退出引号
          }
        } else {
          inQuotes = true; // 进入引号
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());

    return result;
  }

  /**
   * 获取列名到索引的映射
   */
  private getColumnMap(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    headers.forEach((h, i) => {
      map[h] = i;
    });
    return map;
  }

  /**
   * 解析单行数据
   */
  private parseRow(line: string, colMap: Record<string, number>, rowNum: number): SyncOrder | null {
    const cols = this.parseCSVLine(line);

    const orderNo = cols[colMap["订单ID"]] || cols[colMap["订单号"]] || "";
    if (!orderNo) {
      this.log(`第 ${rowNum} 行跳过: 订单号为空`);
      return null;
    }

    // 获取各字段原始值
    const status = cols[colMap["订单状态"]] || "";
    const rentalPeriod = cols[colMap["租期"]] || "";
    const renewalPeriod = cols[colMap["续租租期"]] || "";

    // 租期天数：从"租期"列提取数字（可能有"天"字，如"7天"→7）
    const rentalDaysStr = cols[colMap["租期"]] || "";
    const rentalDays = this.extractNumber(rentalDaysStr);

    // 长租过滤：租期 > 90 天跳过
    if (rentalDays !== null && rentalDays > 90) {
      this.log(`第 ${rowNum} 行跳过: 订单 ${orderNo} 租期 ${rentalDays} 天 > 90 天`);
      return null;
    }

    // 解析发货时间
    const shipDateStr = cols[colMap["发货时间"]] || cols[colMap["发货日期"]] || "";
    const shipDate = this.parseDate(shipDateStr);

    // 计算归还日期（预估）：参考Python逻辑
    // - 若续租租期不为空，取续租最后一段结束日期 + 3天
    // - 否则取主租期结束日期 + 3天
    const estimatedReturnDate = this.calcEstimatedReturn(rentalPeriod, renewalPeriod);

    // 计算实际发货日期：参考Python逻辑
    // - 取租期开始日期
    // - if (today - 1) > start_date: 返回 start_date - 3天
    // - else: 返回 today - 1
    const actualShipDate = this.calcActualShipDate(rentalPeriod);

    // 解析租金
    const rentalFeeStr = cols[colMap["总租金"]] || cols[colMap["租金"]] || "0";
    const rentalFee = parseFloat(rentalFeeStr.replace(/[^\d.]/g, "")) || 0;

    // 映射订单状态（参考Python逻辑）
    const mappedStatus = this.mapStatus(status);

    return {
      platform_id: "renrenzu",
      order_no: orderNo,
      ship_date: shipDate,
      customer_name: cols[colMap["收件人"]] || "",
      phone: cols[colMap["收件人电话"]] || "",
      sn_code: "", // 人人租 CSV 无有效 SN，留空
      device_model: cols[colMap["型号"]] || "",
      package: cols[colMap["套餐名称"]] || "",
      estimated_return_date: estimatedReturnDate || undefined,
      rental_days: rentalDays ?? undefined,
      rental_fee: rentalFee,
      actual_ship_date: actualShipDate || undefined,
      status: mappedStatus,
      raw_status: status,
    };
  }

  /**
   * 从字符串中提取数字
   * 如 "30天" → 30, "7" → 7
   */
  private extractNumber(val: string): number | null {
    if (!val) return null;
    const s = val.trim();
    if (!s) return null;
    const match = s.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * 解析租期字段，格式：'2026-04-10 ~ 2026-04-14'
   * 返回 (start_date, end_date)
   */
  private parseRentalPeriod(val: string): { start: Date | null; end: Date | null } {
    if (!val) return { start: null, end: null };
    const s = val.trim();
    const match = s.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
    if (!match) return { start: null, end: null };
    try {
      const start = new Date(match[1]);
      const end = new Date(match[2]);
      return { start, end };
    } catch {
      return { start: null, end: null };
    }
  }

  /**
   * 解析续租租期字段，格式：'2026-04-14至2026-04-14;2026-04-17至2026-04-19;'
   * 返回最后一段的结束日期
   */
  private parseRenewalLastEnd(val: string): Date | null {
    if (!val) return null;
    const s = val.trim();
    if (!s) return null;
    // 分割多段
    const segments = s.split(";").map(seg => seg.trim()).filter(seg => seg);
    if (segments.length === 0) return null;
    // 取最后一段
    const lastSeg = segments[segments.length - 1];
    const match = lastSeg.match(/\d{4}-\d{2}-\d{2}至(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;
    try {
      return new Date(match[1]);
    } catch {
      return null;
    }
  }

  /**
   * 计算归还日期（预估）
   * - 若续租租期不为空，取续租最后一段结束日期 + 3天
   * - 否则取主租期结束日期 + 3天
   */
  private calcEstimatedReturn(rentalPeriod: string, renewalPeriod: string): Date | null {
    // 先尝试续租
    const endRenew = this.parseRenewalLastEnd(renewalPeriod);
    if (endRenew) {
      const result = new Date(endRenew);
      result.setDate(result.getDate() + 3);
      return result;
    }
    // 取主租期结束日期
    const { end } = this.parseRentalPeriod(rentalPeriod);
    if (end) {
      const result = new Date(end);
      result.setDate(result.getDate() + 3);
      return result;
    }
    return null;
  }

  /**
   * 计算实际发货日期
   * - 取租期开始日期
   * - if (today - 1) > start_date: 返回 start_date - 3天
   * - else: 返回 today - 1
   */
  private calcActualShipDate(rentalPeriod: string): Date | null {
    const { start } = this.parseRentalPeriod(rentalPeriod);
    if (!start) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let result: Date;
    if (yesterday > start) {
      result = new Date(start);
      result.setDate(result.getDate() - 3);
    } else {
      result = yesterday;
    }
    return result;
  }

  /**
   * 解析日期
   */
  private parseDate(dateStr: string): Date | undefined {
    if (!dateStr) return undefined;

    // 尝试多种日期格式
    const formats = [
      // YYYY-MM-DD HH:mm:ss
      /^(\d{4})-(\d{1,2})-(\d{1,2})/,
      // YYYY/MM/DD HH:mm:ss
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})/,
      // DD/MM/YYYY
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        let year: number, month: number, day: number;
        if (format === formats[2]) {
          // DD/MM/YYYY
          [, day, month, year] = match.map(Number) as [number, number, number, number];
        } else {
          [, year, month, day] = match.map(Number) as [number, number, number, number];
        }
        return new Date(year, month - 1, day);
      }
    }

    // 尝试直接解析
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? undefined : date;
  }

  /**
   * 映射订单状态（参考Python逻辑）
   * 状态映射：
   * - "交易完成" → "已完结"
   * - "订单关闭（商家/系统/用户）" → "取消"
   * - 其他状态（包括"待发货/待归还/待收货/归还中/租用中"）→ ""（进行中）
   */
  private mapStatus(rawStatus: string): string {
    const status = rawStatus.trim();
    // 已完结
    if (status === "交易完成") return "已完结";
    // 取消
    if (status.includes("订单关闭")) return "取消";
    // 进行中（待发货/待归还/待收货/归还中/租用中/退款等）
    return "";
  }
}
