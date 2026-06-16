/**
 * 同步订单 API
 * POST /api/actions/sync-orders
 */

import { NextRequest, NextResponse } from "next/server";
import { SyncEngine } from "@/lib/sync/engine";
import { getStoreConfig } from "@/lib/config";
import iconv from "iconv-lite";

export const runtime = "nodejs";

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

    // 使用 iconv-lite 正确处理编码转换
    if (encoding === "gbk" || encoding === "gb2312" || encoding === "gb18030") {
      content = iconv.decode(buffer, "gbk");
    } else {
      // 尝试 UTF-8，如果失败则尝试 GBK
      try {
        content = buffer.toString("utf-8");
        // 检查是否有替换字符，说明UTF-8解析失败
        if (content.includes("\ufffd")) {
          content = iconv.decode(buffer, "gbk");
        }
      } catch {
        content = iconv.decode(buffer, "gbk");
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
