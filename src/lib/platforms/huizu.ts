/**
 * 惠租订单解析器
 * 格式：xlsx (UTF-8)
 * 共 22 列
 */

import * as XLSX from "xlsx";
import { SyncOrder, ParseResult } from "../sync/types";

/**
 * 惠租解析器
 */
export class HuizuParser {
  private logs: string[] = [];

  private log(msg: string) {
    this.logs.push(`[HuizuParser] ${msg}`);
    console.log(`[HuizuParser] ${msg}`);
  }

  /**
   * 解析惠租 xlsx 文件
   * @param content xlsx 文件的 Buffer 或 base64 字符串
   * @returns 解析结果
   */
  parse(content: string | Buffer): ParseResult {
    this.logs = [];
    const orders: SyncOrder[] = [];

    try {
      // 解析 xlsx
      const buffer = typeof content === "string" ? Buffer.from(content, "base64") : content;
      this.log(`输入类型: ${typeof content}, Buffer 大小: ${buffer.length} 字节`);

      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(buffer, { type: "buffer" });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        this.log(`XLSX.read() 失败: ${errMsg}`);
        return { orders, logs: this.logs };
      }

      this.log(`工作表数量: ${workbook.SheetNames.length}, 名称: ${workbook.SheetNames.join(", ")}`);

      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        this.log("未找到工作表");
        return { orders, logs: this.logs };
      }

      const sheet = workbook.Sheets[sheetName];

      // 先检查原始范围
      const range = sheet["!ref"];
      this.log(`工作表范围: ${range || "(空)"}`);

      // 转为 JSON（以第一行为表头）
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      this.log(`sheet_to_json 解析出 ${rows.length} 行数据`);

      if (rows.length === 0) {
        this.log("数据行数为 0，尝试检查原始单元格...");
        // 输出前几个单元格帮助诊断
        const allKeys = Object.keys(sheet).filter(k => !k.startsWith("!"));
        this.log(`原始单元格数量: ${allKeys.length}`);
        if (allKeys.length > 0) {
          const sample = allKeys.slice(0, 20).map(k => `${k}=${JSON.stringify(sheet[k]?.v ?? "")}`);
          this.log(`原始单元格样本: ${sample.join(", ")}`);
        }
        return { orders, logs: this.logs };
      }

      // 输出表头（列名）
      const headers = Object.keys(rows[0]);
      this.log(`表头列名 (${headers.length} 列): ${headers.join(" | ")}`);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const order = this.parseRow(row, i + 2); // Excel 行号从 2 开始（1 是表头）
          if (order) {
            orders.push(order);
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          this.log(`解析第 ${i + 2} 行异常: ${errMsg}`);
        }
      }

      this.log(`解析完成，有效订单 ${orders.length} 条（共 ${rows.length} 行数据）`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.log(`解析器顶层异常: ${errMsg}`);
    }

    return { orders, logs: this.logs };
  }

  /**
   * 解析单行数据
   */
  private parseRow(row: Record<string, unknown>, rowNum: number): SyncOrder | null {
    // 按列索引获取值（xlsx sheet_to_json 以表头为 key）
    const orderNo = String(row["订单号"] || "").trim();
    if (!orderNo) {
      this.log(`第 ${rowNum} 行跳过: 订单号为空`);
      return null; // 跳过无订单号的行
    }

    const rawStatus = String(row["订单状态"] || "").trim();
    this.log(`第 ${rowNum} 行: 订单号=${orderNo}, 原始状态="${rawStatus}"`);

    // 长租过滤：租期 > 90 天跳过
    const rentalDaysRaw = row["总租用天数"];
    const rentalDays = this.extractNumber(rentalDaysRaw);
    if (rentalDays !== null && rentalDays > 90) {
      this.log(`  → 跳过: 租期 ${rentalDays} 天 > 90 天`);
      return null;
    }

    // 解析日期
    const orderTime = String(row["下单时间"] || "").trim();
    const startDate = String(row["起租日期"] || "").trim();
    const endDate = String(row["结束日期"] || "").trim();

    const shipDate = this.parseDate(orderTime);
    const estimatedReturnDate = this.calcEstimatedReturn(endDate);
    const actualShipDate = this.calcActualShipDate(startDate);

    // 商品名称清洗
    const productName = String(row["商品名称"] || "").trim();
    const deviceModel = this.extractDeviceModel(productName);

    // 规格→套餐
    const spec = String(row["规格"] || "").trim();
    const packageInfo = this.extractPackage(spec);

    // 租金
    const rentalFeeRaw = row["总租金"];
    const rentalFee = this.extractNumber(rentalFeeRaw) ?? 0;

    // 状态映射
    const mappedStatus = this.mapStatus(rawStatus);
    this.log(`  → 映射状态: "${mappedStatus || "(进行中)"}", 设备: ${deviceModel}, 租期: ${rentalDays}天`);

    return {
      platform_id: "huizu",
      order_no: orderNo,
      ship_date: shipDate || undefined,
      customer_name: String(row["收货人姓名"] || "").trim(),
      phone: String(row["收货人电话"] || "").trim(),
      sn_code: "", // 惠租 CSV 无有效 SN，留空人工填
      device_model: deviceModel,
      package: packageInfo,
      remark: String(row["用户备注"] || "").trim(),
      estimated_return_date: estimatedReturnDate || undefined,
      rental_days: rentalDays ?? undefined,
      rental_fee: rentalFee,
      express_settlement: "南通月结", // 固定值
      actual_ship_date: actualShipDate || undefined,
      status: mappedStatus,
      raw_status: rawStatus,
    };
  }

  /**
   * 从值中提取数字
   */
  private extractNumber(val: unknown): number | null {
    if (val === null || val === undefined || val === "") return null;
    const s = String(val).trim();
    if (!s) return null;
    const match = s.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * 解析日期
   * 支持格式：YYYY-MM-DD、YYYY-MM-DD HH:mm:ss、YYYY/MM/DD 等
   */
  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // 尝试提取 YYYY-MM-DD 或 YYYY/MM/DD 部分
    const match = dateStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const [, year, month, day] = match.map(Number) as [number, number, number, number];
      if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(year, month - 1, day);
      }
    }

    // 尝试直接解析
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * 计算归还日期（预估）：结束日期 + 3天
   */
  private calcEstimatedReturn(endDateStr: string): Date | null {
    const endDate = this.parseDate(endDateStr);
    if (!endDate) return null;
    const result = new Date(endDate);
    result.setDate(result.getDate() + 3);
    return result;
  }

  /**
   * 计算实际发货日期：起租日期 - 3天
   */
  private calcActualShipDate(startDateStr: string): Date | null {
    const startDate = this.parseDate(startDateStr);
    if (!startDate) return null;
    const result = new Date(startDate);
    result.setDate(result.getDate() - 3);
    return result;
  }

  /**
   * 商品名称清洗（方案A）：从营销长文本中提取核心设备型号
   */
  private extractDeviceModel(productName: string): string {
    if (!productName) return "";

    // 1. 去除营销前缀：【...】、支持【...】、支持{...}
    let cleaned = productName
      .replace(/^(支持)?[【{][^】}]*[】}]\s*/g, "")
      .replace(/^(【[^】]*】\s*)+/g, "");

    // 2. 去除营销后缀
    const marketingSuffixes = [
      "顺丰包邮", "一天起租", "全网低价", "99新", "极速发货",
      "赠壳膜", "晚到必赔", "现货速发", "短租", "可自提",
      "全国联保", "正品保证", "分期付款", "免押金", "当日达",
    ];
    for (const suffix of marketingSuffixes) {
      cleaned = cleaned.replace(new RegExp(suffix, "g"), "");
    }
    cleaned = cleaned.trim();

    // 3. 提取已知型号
    const knownModels = [
      /佳能\s*G7X\s*2/i,
      /佳能\s*G7X\s*3/i,
      /佳能\s*G7X2/i,
      /佳能\s*G7X3/i,
      /佳能\s*SX70\s*HS/i,
      /佳能\s*R50/i,
      /佳能\s*R6/i,
      /佳能\s*R7/i,
      /佳能\s*R8/i,
      /佳能\s*R10/i,
      /索尼\s*RX10\s*M4/i,
      /索尼\s*RX100\s*M[5-7]/i,
      /索尼\s*A7\s*[Mm]?[2-4]/i,
      /索尼\s*A6[4-7]\d{0,1}/i,
      /理光\s*GR3/i,
      /理光\s*GR3x/i,
      /大疆\s*OSMO\s*Pocket\s*3/i,
      /大疆\s*Pocket\s*3/i,
      /大疆\s*Action\s*\d/i,
      /iPhone\s*1[5-9]\s*(pro\s*max|pro)?/i,
      /iPhone\s*17/i,
      /vivo\s*X300\s*Ultra/i,
      /vivo\s*X200\s*Pro/i,
      /华为\s*P(?:ura)?\s*\d{0,3}\s*(Pro|Ultra)?/i,
      /华为\s*Mate\s*\d{0,3}\s*(Pro|RS)?/i,
      /小米\s*\d{1,2}\s*(Ultra|Pro)?/i,
      /OPPO\s*Find\s*X?\s*\d{0,3}\s*(Pro|Ultra)?/i,
      /iPad\s*(?:Pro|Air|mini)?\s*\d{0,3}/i,
      /MacBook\s*(?:Pro|Air)?\s*\d{0,3}/i,
      /Nintendo\s*Switch/i,
      /PS5/i,
      /Xbox\s*Series\s*[XxSs]/i,
    ];

    for (const pattern of knownModels) {
      const match = cleaned.match(pattern);
      if (match) {
        return match[0].replace(/\s+/g, " ").trim();
      }
    }

    // 4. 兜底：取第一个有意义的文本段
    const firstWord = cleaned.split(/[\s,，]+/)[0];
    return firstWord || cleaned.substring(0, 30);
  }

  /**
   * 规格→套餐处理
   * 格式如：日常档期/佳能G7X2+双电+64G卡+读卡器
   * 取 / 后面的部分
   */
  private extractPackage(spec: string): string {
    if (!spec || spec === "暂无数据") return "";
    const slashIndex = spec.indexOf("/");
    if (slashIndex >= 0) {
      return spec.substring(slashIndex + 1).trim();
    }
    return spec.trim();
  }

  /**
   * 状态映射
   * - 租用中 → ""（进行中）
   * - 待商家发货 → "待发货"
   * - 待用户确认收货 → "待收货"
   * - 订单完成 → "已完结"
   * - 待结算 → "已完结"
   * - 用户取消订单 → "取消"
   * - 申请退款关闭订单 → "退款"
   * - 商家风控关单 → "取消"
   * - 用户超时支付关闭订单 → "取消"
   * - 平台关闭订单 → "取消"
   */
  private mapStatus(rawStatus: string): string {
    const status = rawStatus.trim();

    if (status === "租用中") return "";
    if (status === "待商家发货") return "待发货";
    if (status === "待用户确认收货") return "待收货";
    if (status === "订单完成") return "已完结";
    if (status === "待结算") return "已完结";
    if (status === "用户取消订单") return "取消";
    if (status === "申请退款关闭订单") return "退款";
    if (status === "商家风控关单") return "取消";
    if (status === "用户超时支付关闭订单") return "取消";
    if (status === "平台关闭订单") return "取消";

    // 兜底：空字符串表示进行中
    return "";
  }
}
