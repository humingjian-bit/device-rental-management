/**
 * 统一订单数据模型
 * 所有平台解析后统一转换为 SyncOrder，再写入飞书
 */

export interface SyncOrder {
  platform_id: string;              // 平台标识（renrenzu/huizu/huizu_renewal/youpinzu/chenglin）
  order_no: string;                // 订单号（唯一键）

  // 基础信息
  ship_date?: Date;                // 发货日期
  customer_name?: string;           // 姓名
  phone?: string;                  // 手机号码
  sn_code?: string;               // SN编码（关联库存用，由人工填入）
  device_model?: string;           // 租机型号
  package?: string;                // 套餐
  remark?: string;                 // 备注

  // 费用与租期
  estimated_return_date?: Date;     // 归还日期（预估）
  rental_days?: number;            // 租期（天）
  rental_fee?: number;             // 租金
  express_settlement?: string;     // 快递结算方式

  // 时间
  actual_ship_date?: Date;         // 实际发货日期（只在新增时写入）

  // 状态
  raw_status?: string;             // 平台原始状态
  status?: string;                // 映射后状态（已完结/取消/空值进行中）

  // 续租专用
  original_order_no?: string;      // 原订单号（惠租续租用）
}

/**
 * 同步统计结果
 */
export interface SyncStats {
  created: number;                 // 新增数量
  updated: number;                 // 更新数量
  skipped: number;                 // 跳过数量（长租等原因）
  skipped_reasons: string[];       // 跳过原因
  inventory_updated: number;       // 库存更新数量
  inventory_failed: number;        // 库存更新失败数量
  errors: string[];                // 错误信息
}

/**
 * 同步日志条目
 */
export interface SyncLogEntry {
  level: "INFO" | "WARNING" | "ERROR";
  message: string;
  timestamp: string;
}

/**
 * 同步结果
 */
export interface SyncResult {
  success: boolean;
  stats: SyncStats;
  logs: SyncLogEntry[];
}
