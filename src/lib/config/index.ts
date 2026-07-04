import YAML from "yaml";
import fs from "fs";
import path from "path";

export interface PlatformConfig {
  id: string;
  name: string;
  enabled: boolean;
  file_type: string;
  encoding: string;
}

export interface StoreConfig {
  id: string;
  name: string;
  base_token: string;
  tables: {
    device: string;
    inventory: string;
    order: string;
    repair: string;
  };
  default_warehouse: string;
  platforms: PlatformConfig[];
}

export interface AppConfig {
  app_id: string;
  stores: StoreConfig[];
  roles: Record<string, string[]>;
}

let _config: AppConfig | null = null;

/**
 * 获取当前运行环境（仅用于日志和前端标识）
 */
export function getAppEnv(): string {
  return process.env.NEXT_PUBLIC_APP_ENV || "production";
}

/**
 * 是否为测试环境
 */
export function isTestEnv(): boolean {
  return getAppEnv() === "test";
}

export function loadConfig(): AppConfig {
  if (_config) return _config;

  const isProd = process.env.NODE_ENV === "production";

  // 部署环境优先读项目根目录 config/stores.yaml
  const deployConfigPath = path.join(process.cwd(), "config/stores.yaml");
  // 开发环境读 src/config/stores.yaml
  const devConfigPath = path.join(process.cwd(), "src/config/stores.yaml");

  let configPath: string | null = null;

  if (fs.existsSync(deployConfigPath)) {
    configPath = deployConfigPath;
  } else if (!isProd && fs.existsSync(devConfigPath)) {
    configPath = devConfigPath;
  }

  if (!configPath) {
    if (isProd) {
      throw new Error(
        `[Config] 生产环境配置文件缺失：${deployConfigPath}\n` +
        `请确保部署环境 config/stores.yaml 存在且配置正确。`
      );
    } else {
      throw new Error(
        `[Config] 开发环境配置文件缺失：${devConfigPath}\n` +
        `请从 src/config/stores.yaml.example 复制一份并配置。`
      );
    }
  }

  console.log(`[Config] 加载配置文件: ${configPath} (env: ${isProd ? "production" : "development"})`);

  const fileContents = fs.readFileSync(configPath, "utf8");
  const raw = YAML.parse(fileContents);

  _config = {
    app_id: raw.app?.app_id || "",
    stores: raw.stores || [],
    roles: raw.roles || {},
  };

  return _config;
}

export function getStoreConfig(storeId: string): StoreConfig | undefined {
  const config = loadConfig();
  return config.stores.find((s) => s.id === storeId);
}

export function getTableId(storeId: string, tableName: keyof StoreConfig["tables"]): string | undefined {
  const store = getStoreConfig(storeId);
  return store?.tables[tableName];
}
