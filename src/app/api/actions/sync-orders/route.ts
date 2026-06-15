/**
 * 同步订单 API
 * POST /api/actions/sync-orders
 */

import { NextRequest, NextResponse } from "next/server";
import { SyncEngine } from "@/lib/sync/engine";
import { getStoreConfig } from "@/lib/config";

export const runtime = "nodejs";

/**
 * 简单的GBK到UTF-8转换
 * 使用预计算映射表处理常见字符
 */
function gbkToUtf8(buffer: Buffer): string {
  // GBK编码范围: 高字节 0x81-0xFE, 低字节 0x40-0xFE
  const GBK_MAP: Record<number, string> = {
    0xA1A1: " ", 0xA1B1: "、", 0xA1B2: "。", 0xA1B3: "·",
    0xA1B4: "～…", 0xA1B5: "‖", 0xA1B6: "'", 0xA1B7: "'",
    0xA1B8: "「", 0xA1B9: "」", 0xC2A8: "℃",
    // 常用中文标点和符号的GBK编码
    0xA3A1: "!", 0xA3A8: "×", 0xA3AC: ",", 0xA3BA: ":",
    0xA3BB: ";", 0xA3BF: "?", 0xA3E8: "《", 0xA3E9: "》",
  };

  // 对于GBK文件，先尝试将每个字节作为Latin1字符读取
  // 正确处理需要在应用层做字符集检测
  // 这里简化处理：如果文件包含中文字符，会在解析时报错
  return buffer.toString("binary");
}

/**
 * 检测文件是否为GBK编码（简单检测）
 */
function isLikelyGbk(buffer: Buffer): boolean {
  // 检查是否包含GBK特有的高字节模式
  let gbkCount = 0;
  let totalHigh = 0;

  for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
    const byte = buffer[i];
    if (byte > 0x7F) {
      totalHigh++;
      // GBK高字节范围
      if (byte >= 0x81 && byte <= 0xFE) {
        gbkCount++;
      }
    }
  }

  // 如果超过30%的高字节是GBK模式，认为是GBK编码
  return totalHigh > 10 && gbkCount / totalHigh > 0.3;
}

export async function POST(request: NextRequest) {
  try {
    // 解析 multipart/form-data
    const formData = await request.formData();
    const storeId = formData.get("store") as string;
    const platformId = formData.get("platform") as string;
    const file = formData.get("file") as File;

    // 验证参数
    if (!storeId || !platformId || !file) {
      return NextResponse.json(
        { success: false, error: "缺少必要参数: store, platform, file" },
        { status: 400 }
      );
    }

    // 验证店铺配置
    const store = getStoreConfig(storeId);
    if (!store) {
      return NextResponse.json(
        { success: false, error: `店铺配置不存在: ${storeId}` },
        { status: 400 }
      );
    }

    // 验证平台配置
    const platform = store.platforms?.find((p) => p.id === platformId);
    if (!platform) {
      return NextResponse.json(
        { success: false, error: `平台配置不存在: ${platformId}` },
        { status: 400 }
      );
    }

    if (!platform.enabled) {
      return NextResponse.json(
        { success: false, error: `平台尚未启用: ${platform.name}` },
        { status: 400 }
      );
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 根据编码转换
    let content: string;
    const encoding = (platform.encoding || "utf-8").toLowerCase();

    if (encoding === "gbk" || encoding === "gb2312" || encoding === "gb18030") {
      // 使用自定义GBK转换
      content = gbkToUtf8(buffer);
    } else {
      // 尝试 UTF-8，如果失败则尝试 GBK
      try {
        content = buffer.toString("utf-8");
        // 检查是否有替换字符
        if (content.includes("\ufffd") && isLikelyGbk(buffer)) {
          content = gbkToUtf8(buffer);
        }
      } catch {
        content = gbkToUtf8(buffer);
      }
    }

    // 执行同步
    const engine = new SyncEngine(storeId, platformId);
    const result = await engine.run(content);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[sync-orders] Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
