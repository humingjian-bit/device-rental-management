import { NextResponse } from "next/server";
import { loadConfig, getAppEnv } from "@/lib/config";

// GET /api/config/stores - 返回店铺配置（不含敏感信息）
export async function GET() {
  try {
    const config = loadConfig();

    // 不返回 base_token、tables 等敏感信息
    const safeStores = config.stores.map((store) => ({
      id: store.id,
      name: store.name,
      default_warehouse: store.default_warehouse,
      platforms: store.platforms || [],
    }));

    return NextResponse.json({
      stores: safeStores,
      env: getAppEnv(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500 }
    );
  }
}
