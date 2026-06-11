import { NextResponse } from "next/server";
import YAML from "yaml";
import fs from "fs";
import path from "path";

// GET /api/config/stores - 返回店铺配置（不含敏感信息）
export async function GET() {
  try {
    const configPath = path.join(process.cwd(), "src/config/stores.yaml");
    const fileContents = fs.readFileSync(configPath, "utf8");
    const config = YAML.parse(fileContents);

    // 不返回 app_secret
    const safeStores = config.stores.map((store: Record<string, unknown>) => ({
      id: store.id,
      name: store.name,
      default_warehouse: store.default_warehouse,
      platforms: store.platforms || [],
    }));

    return NextResponse.json({ stores: safeStores });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500 }
    );
  }
}
