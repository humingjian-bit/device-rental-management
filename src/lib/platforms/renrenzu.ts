/**
 * 人人租 CSV 解析器
 * 格式：GBK 编码 CSV
 */

import { SyncOrder } from "../types";

/**
 * 人人租解析器
 */
export class RenrenzuParser {
  /**
   * 解析人人租 CSV 文件
   * @param content CSV 文件内容（GBK编码）
   * @returns 解析后的订单列表
   */
  parse(content: string): SyncOrder[] {
    const orders: SyncOrder[] = [];
    const lines = content.trim().split("\n");

    if (lines.length < 2) {
      return orders;
    }

    // 解析表头（第一行）
    const headers = this.parseCSVLine(lines[0]);

    // 找到各列索引
    const colMap = this.getColumnMap(headers);

    // 跳过第一行（表头），解析数据行
    for (let i = 1; i < lines.length; i++) {
      try {
        const order = this.parseRow(lines[i], colMap);
        if (order) {
          orders.push(order);
        }
      } catch (e) {
        console.error(`[RenrenzuParser] 解析第${i + 1}行失败:`, e);
      }
    }

    return orders;
  }

  /**
   * 解析单行CSV
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
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
  private parseRow(line: string, colMap: Record<string, number>): SyncOrder | null {
    const cols = this.parseCSVLine(line);

    const orderNo = cols[colMap["订单ID"]] || cols[colMap["订单号"]] || "";
    if (!orderNo) {
      return null;
    }

    const status = cols[colMap["订单状态"]] || "";
    const rentalDays = parseInt(cols[colMap["租期数"]] || cols[colMap["租期"]] || "0", 10);

    // 长租过滤：租期 > 90 天跳过
    if (rentalDays > 90) {
      return null;
    }

    // 解析发货时间
    const shipDateStr = cols[colMap["发货时间"]] || cols[colMap["发货日期"]] || "";
    const shipDate = this.parseDate(shipDateStr);

    // 计算归还日期（预估）：发货日期 + 租期 + 3天缓冲
    const estimatedReturnDate = new Date(shipDate);
    estimatedReturnDate.setDate(estimatedReturnDate.getDate() + rentalDays + 3);

    // 计算实际发货日期
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const actualShipDate = shipDateStr && shipDate && yesterday > shipDate
      ? new Date(shipDate.getTime() - 3 * 24 * 60 * 60 * 1000)
      : yesterday;

    // 解析租金
    const rentalFeeStr = cols[colMap["总租金"]] || cols[colMap["租金"]] || "0";
    const rentalFee = parseFloat(rentalFeeStr.replace(/[^\d.]/g, "")) || 0;

    // 映射订单状态
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
      estimated_return_date: estimatedReturnDate,
      rental_days: rentalDays,
      rental_fee: rentalFee,
      actual_ship_date: actualShipDate,
      status: mappedStatus,
      raw_status: status,
    };
  }

  /**
   * 解析日期
   */
  private parseDate(dateStr: string): Date | undefined {
    if (!dateStr) return undefined;

    // 尝试多种日期格式
    const formats = [
      // YYYY-MM-DD
      /^(\d{4})-(\d{1,2})-(\d{1,2})/,
      // YYYY/MM/DD
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
   * 映射订单状态
   */
  private mapStatus(rawStatus: string): string {
    const status = rawStatus.trim();
    if (status === "已完结") return "已完结";
    if (status === "退款" || status === "取消") return "取消";
    // 进行中（待归还/待收货/归还中/待发货/订单关闭）
    return "";
  }
}
