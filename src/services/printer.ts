/**
 * 精臣标签打印机服务
 * 调用本机打印服务（ws://127.0.0.1:37989），需安装 jcPrinterSdk_4.0.6_20251120.exe
 *
 * 注意：SDK 全局函数（getInstance, getAllPrinters, initSdk 等）与导出函数同名时，
 * 必须用 window.xxx() 显式调用全局版本，避免递归。
 */

/** 打印配置对象 */
const jsonObj = {
  printerImageProcessingInfo: {
    printQuantity: 1,
  },
};

/** 打印服务是否已连接 */
export function isServiceConnected(): boolean {
  return typeof getInstance === 'function' && typeof isWebSocketConnected === 'function' && isWebSocketConnected();
}

/**
 * 连接打印服务
 */
export function connectService(
  onConnected: () => void,
  onError: (msg: string) => void,
  onDisconnected: () => void
): void {
  getInstance(
    () => onConnected(),
    () => onError('浏览器不支持 WebSocket 打印服务'),
    () => onDisconnected()
  );
}

/**
 * 获取 USB 打印机列表
 * SDK 返回的对象格式为 { name: port, ... }，这里转为数组
 * @returns [{name, port}, ...]
 */
export async function getPrinters(): Promise<{ name: string; port: number }[]> {
  const r = await getAllPrinters();
  if (r.resultAck.errorCode === 0) {
    const raw = JSON.parse(r.resultAck.info || '{}');
    // SDK 返回的是 { name: port } 对象，转为数组
    if (Array.isArray(raw)) return raw;
    return Object.entries(raw).map(([name, port]) => ({
      name,
      port: Number(port),
    }));
  }
  throw new Error('获取打印机失败: errorCode=' + r.resultAck.errorCode);
}

/**
 * 连接指定打印机
 */
export async function connectPrinter(name: string, port: number): Promise<void> {
  const r = await selectPrinter(name, parseInt(String(port)));
  if (r.resultAck.errorCode !== 0) {
    throw new Error('连接打印机失败: errorCode=' + r.resultAck.errorCode);
  }
}

/**
 * 初始化 SDK
 * 注意：使用 window.initSdk 调用全局 SDK 函数，避免与导出函数递归
 */
export async function initSdkService(): Promise<void> {
  const r = await (window as any).initSdk({ fontDir: '' });
  if (r.resultAck.errorCode !== 0) {
    throw new Error('SDK 初始化失败: errorCode=' + r.resultAck.errorCode);
  }
}

/** 打印进度回调 */
export interface PrintProgress {
  type: 'progress' | 'done' | 'error';
  copies?: number;
  pages?: number;
  total?: number;
  result?: PrinterResultAck;
  msg?: string;
  errorCode?: number;
}

/**
 * 打印单张标签
 */
export async function printLabel(
  labelData: LabelData,
  options: { density?: number; labelType?: number; printMode?: number } = {},
  onProgress?: (progress: PrintProgress) => void
): Promise<void> {
  const density = options.density || 3;
  const labelType = options.labelType || 1;
  const printMode = options.printMode || 2; // M2 必须用热转印=2
  const totalPages = 1;
  const printQuantity = jsonObj.printerImageProcessingInfo.printQuantity;

  let currentIndex = 0;
  let listener: ((msg: JobListenerMessage) => void) | null = null;

  if (onProgress) {
    listener = async (msg: JobListenerMessage) => {
      const ack = msg?.resultAck;
      if (!ack) return;

      // daemon 推送就绪信号
      if (msg.apiName === 'commitJob' && ack.info === 'commitJob ok!') {
        if (currentIndex < totalPages) {
          try {
            await sendPageData(labelData);
            currentIndex++;
          } catch (e: any) {
            onProgress({ type: 'error', msg: e.message });
          }
        }
        return;
      }

      // 打印进度
      if (ack.printCopies != null && ack.printPages != null) {
        onProgress({ type: 'progress', copies: ack.printCopies, pages: ack.printPages, total: totalPages });
      }

      // 全部完成
      if (ack.printCopies === printQuantity && ack.printPages === totalPages) {
        try {
          const end = await endJob();
          onProgress({ type: 'done', result: end.resultAck });
        } catch (e: any) {
          onProgress({ type: 'error', msg: e.message });
        } finally {
          if (listener) removeJobListener(listener);
        }
      }

      // 错误
      if (ack.errorCode !== 0 && ack.info !== 'commitJob ok!') {
        onProgress({ type: 'error', errorCode: ack.errorCode, msg: ack.info });
      }
    };
    addJobListener(listener);
  }

  try {
    const r = await startJob(density, labelType, printMode, totalPages);
    if (r.resultAck.errorCode !== 0) {
      throw new Error('startJob 失败: errorCode=' + r.resultAck.errorCode);
    }
  } catch (e) {
    if (listener) removeJobListener(listener);
    throw e;
  }
}

// ============ 内部方法 ============

async function sendPageData(labelData: LabelData): Promise<void> {
  const initRes = await InitDrawingBoard(labelData.InitDrawingBoardParam);
  if (initRes.resultAck.errorCode !== 0) {
    throw new Error('画布初始化失败');
  }

  await drawElements(labelData.elements);

  const commitRes = await commitJob(null, JSON.stringify(jsonObj));
  if (commitRes.resultAck.errorCode !== 0) {
    throw new Error('提交打印失败');
  }
}

async function drawElements(elements: LabelElement[]): Promise<void> {
  if (!elements || elements.length === 0) return;
  for (const item of elements) {
    const json = item.json;
    let res: PrinterResult | undefined;
    switch (item.type) {
      case 'text':    res = await DrawLableText(json as any);    break;
      case 'qrCode':  res = await DrawLableQrCode(json);         break;
      case 'barCode': res = await DrawLableBarCode(json as any); break;
      case 'line':    res = await DrawLableLine(json);           break;
      case 'graph':   res = await DrawLableGraph(json);          break;
      case 'image':   res = await DrawLableImage(json);          break;
      default: break;
    }
    if (res && res.resultAck && res.resultAck.errorCode !== 0) {
      console.warn(`[Printer] ${item.type} 绘制失败:`, res.resultAck);
    }
  }
}

// ============ 数据类型 ============

export interface LabelData {
  InitDrawingBoardParam: {
    width: number;
    height: number;
    rotate: number;
    path: string;
    verticalShift: number;
    HorizontalShift: number;
  };
  elements: LabelElement[];
}

interface LabelElement {
  type: 'text' | 'barCode' | 'qrCode' | 'line' | 'graph' | 'image';
  json: Record<string, unknown>;
}

/**
 * 构建设备标签数据
 * @param storeName 店铺名（如 "景行舟"）
 * @param deviceModel 设备型号
 * @param sn SN编码（条码值）
 */
export function buildDeviceLabel(storeName: string, deviceModel: string, sn: string): LabelData {
  const w = 40;  // 标签宽度 mm
  const h = 20;  // 标签高度 mm

  return {
    InitDrawingBoardParam: {
      width: w,
      height: h,
      rotate: 0,
      path: '',
      verticalShift: 0,
      HorizontalShift: 0,
    },
    elements: [
      {
        type: 'barCode',
        json: {
          x: 7.5,
          y: 9.8,
          height: 7.9,
          width: 25,
          value: sn,
          codeType: 20,       // EAN13
          rotate: 0,
          fontSize: 3.2,
          textHeight: 3.2,
          textPosition: 0,
        },
      },
      {
        type: 'text',
        json: {
          x: 2.3,
          y: 1.5,
          height: 8.75,
          width: w - 2.3 - 2.3,  // 左右各留 2.3mm 边距
          value: `${storeName} ${deviceModel}`,
          fontFamily: '',
          rotate: 0,
          fontSize: 3.2,
          textAlignHorizonral: 0,
          textAlignVertical: 0,
          letterSpacing: 0,
          lineSpacing: 0,
          lineMode: 6,
          fontStyle: [false, false, false, false],
        },
      },
    ],
  };
}
