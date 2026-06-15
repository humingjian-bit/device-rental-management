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

export function loadConfig(): AppConfig {
  if (_config) return _config;

  const configPath = path.join(process.cwd(), "src/config/stores.yaml");
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
