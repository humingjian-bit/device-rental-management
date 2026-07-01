/**
 * 精臣打印 SDK 全局函数类型声明
 * SDK 文件: public/js/api/jcPrinterSdk_api_third.js
 * 通过 next/script 在打印页面动态加载
 */

// SDK 内部状态对象（用于 disconnectService 关闭 WebSocket）
declare const APIServiceState: {
  websocket: WebSocket | null;
  ackJsonData: string;
  MessageList: Record<string, unknown>;
  jobListeners: Set<unknown>;
  statusListeners: Set<unknown>;
  timeout_duration: number;
};

interface PrinterResultAck {
  errorCode: number;
  info?: string;
}

interface PrinterResult {
  resultAck: PrinterResultAck;
}

interface PrinterInfo {
  name: string;
  port: number;
}

interface JobListenerMessage {
  apiName?: string;
  resultAck: PrinterResultAck & {
    printCopies?: number;
    printPages?: number;
  };
}

// 连接打印服务
declare function getInstance(
  onConnected: () => void,
  onNotSupported: () => void,
  onDisconnected: () => void
): void;

// WebSocket 连接状态
declare function isWebSocketConnected(): boolean;

// 获取打印机列表
declare function getAllPrinters(): Promise<PrinterResult>;

// 连接指定打印机
declare function selectPrinter(name: string, port: number): Promise<PrinterResult>;

// 初始化 SDK
declare function initSdk(params: { fontDir: string }): Promise<PrinterResult>;

// 开始打印任务
declare function startJob(
  density: number,
  labelType: number,
  printMode: number,
  totalPages: number
): Promise<PrinterResult>;

// 初始化画布
declare function InitDrawingBoard(params: {
  width: number;
  height: number;
  rotate: number;
  path: string;
  verticalShift: number;
  HorizontalShift: number;
}): Promise<PrinterResult>;

// 绘制文本
declare function DrawLableText(json: {
  x: number;
  y: number;
  height: number;
  width: number;
  value: string;
  fontFamily: string;
  rotate: number;
  fontSize: number;
  textAlignHorizonral: number;
  textAlignVertical: number;
  letterSpacing: number;
  lineSpacing: number;
  lineMode: number;
  fontStyle: boolean[];
}): Promise<PrinterResult>;

// 绘制条码
declare function DrawLableBarCode(json: {
  x: number;
  y: number;
  height: number;
  width: number;
  value: string;
  codeType: number;
  rotate: number;
  fontSize: number;
  textHeight: number;
  textPosition: number;
}): Promise<PrinterResult>;

// 绘制二维码
declare function DrawLableQrCode(json: Record<string, unknown>): Promise<PrinterResult>;

// 绘制线条
declare function DrawLableLine(json: Record<string, unknown>): Promise<PrinterResult>;

// 绘制图形
declare function DrawLableGraph(json: Record<string, unknown>): Promise<PrinterResult>;

// 绘制图片
declare function DrawLableImage(json: Record<string, unknown>): Promise<PrinterResult>;

// 提交打印任务
declare function commitJob(nullVal: null, jsonObjStr: string): Promise<PrinterResult>;

// 结束打印任务
declare function endJob(): Promise<PrinterResult>;

// 添加任务监听器
declare function addJobListener(listener: (msg: JobListenerMessage) => void): void;

// 移除任务监听器
declare function removeJobListener(listener: (msg: JobListenerMessage) => void): void;

// 绘制元素（SDK 自带）
declare function printElements(elements: unknown[]): Promise<void>;
