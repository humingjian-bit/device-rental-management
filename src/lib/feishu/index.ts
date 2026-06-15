import { loadConfig } from "../config";

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

interface TokenInfo {
  access_token: string;
  token_type: string;
  expires_in: number;
  obtained_at: number;
}

// tenant_access_token 缓存
let _tenantToken: TokenInfo | null = null;

/**
 * 获取 tenant_access_token（Bot 身份）
 * app_secret 从环境变量 FEISHU_APP_SECRET 读取
 */
export async function getTenantAccessToken(): Promise<string> {
  // 检查缓存是否有效（提前5分钟过期）
  if (_tenantToken && Date.now() < _tenantToken.obtained_at + (_tenantToken.expires_in - 300) * 1000) {
    return _tenantToken.access_token;
  }

  const config = loadConfig();
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appSecret) {
    throw new Error("FEISHU_APP_SECRET environment variable is not set");
  }

  const res = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: config.app_id,
      app_secret: appSecret,
    }),
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to get tenant_access_token: ${data.msg}`);
  }

  _tenantToken = {
    access_token: data.tenant_access_token,
    token_type: data.token_type,
    expires_in: data.expire,
    obtained_at: Date.now(),
  };

  return _tenantToken.access_token;
}

/**
 * 用 authorization_code 换取 user_access_token
 */
export async function getUserAccessToken(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: string;
  name: string;
  avatar_url: string;
}> {
  const config = loadConfig();
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appSecret) {
    throw new Error("FEISHU_APP_SECRET environment variable is not set");
  }

  const res = await fetch(`${FEISHU_API_BASE}/authen/v1/oidc/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getTenantAccessToken()}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
    }),
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to get user_access_token: ${data.msg}`);
  }

  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_in: data.data.expires_in,
    user_id: data.data.user_id,
    name: data.data.name,
    avatar_url: data.data.avatar_url,
  };
}

/**
 * 获取用户信息
 */
export async function getUserInfo(userAccessToken: string): Promise<{
  user_id: string;
  name: string;
  avatar_url: string;
  open_id: string;
}> {
  const res = await fetch(`${FEISHU_API_BASE}/authen/v1/user_info`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to get user info: ${data.msg}`);
  }

  return data.data;
}

// ========== 多维表 API ==========

interface ListParams {
  page_size?: number;
  page_token?: string;
  filter?: string;
  sort?: string;
  field_names?: string[];
}

/**
 * 查询多维表记录列表
 */
export async function listBitableRecords(
  appToken: string,
  tableId: string,
  params?: ListParams,
  tokenType: "tenant" | "user" = "tenant"
): Promise<{
  items: Record<string, unknown>[];
  total: number;
  has_more: boolean;
  page_token?: string;
}> {
  const accessToken =
    tokenType === "tenant" ? await getTenantAccessToken() : "";
  // TODO: user token 需要从 session 获取

  const searchParams = new URLSearchParams();
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));
  if (params?.page_token) searchParams.set("page_token", params.page_token);
  if (params?.filter) searchParams.set("filter", params.filter);
  if (params?.sort) searchParams.set("sort", params.sort);

  const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records${searchParams.toString() ? "?" + searchParams.toString() : ""}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to list records: ${data.msg}`);
  }

  return {
    items: (data.data?.items || []).map(
      (item: { fields?: Record<string, unknown>; record_id?: string }) => ({
        ...item.fields,
        _record_id: item.record_id,
      })
    ),
    total: data.data?.total || 0,
    has_more: data.data?.has_more || false,
    page_token: data.data?.page_token,
  };
}

/**
 * 获取单条记录
 */
export async function getBitableRecord(
  appToken: string,
  tableId: string,
  recordId: string,
  tokenType: "tenant" | "user" = "tenant"
): Promise<Record<string, unknown>> {
  const accessToken =
    tokenType === "tenant" ? await getTenantAccessToken() : "";

  const res = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to get record: ${data.msg}`);
  }

  return { ...data.data?.record?.fields, _record_id: recordId };
}

/**
 * 创建记录
 */
export async function createBitableRecord(
  appToken: string,
  tableId: string,
  fields: Record<string, unknown>,
  tokenType: "tenant" | "user" = "tenant"
): Promise<Record<string, unknown>> {
  const accessToken =
    tokenType === "tenant" ? await getTenantAccessToken() : "";

  const res = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to create record: ${data.msg}`);
  }

  return { ...data.data?.record?.fields, _record_id: data.data?.record?.record_id };
}

/**
 * 更新记录
 */
export async function updateBitableRecord(
  appToken: string,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
  tokenType: "tenant" | "user" = "tenant"
): Promise<Record<string, unknown>> {
  const accessToken =
    tokenType === "tenant" ? await getTenantAccessToken() : "";

  const res = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to update record: ${data.msg}`);
  }

  return { ...data.data?.record?.fields, _record_id: recordId };
}

/**
 * 批量创建记录
 */
export async function batchCreateBitableRecords(
  appToken: string,
  tableId: string,
  records: { fields: Record<string, unknown> }[],
  tokenType: "tenant" | "user" = "tenant"
): Promise<Record<string, unknown>[]> {
  const accessToken =
    tokenType === "tenant" ? await getTenantAccessToken() : "";

  const res = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records }),
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to batch create records: ${data.msg}`);
  }

  return (data.data?.records || []).map(
    (r: { fields?: Record<string, unknown>; record_id?: string }) => ({
      ...r.fields,
      _record_id: r.record_id,
    })
  );
}

/**
 * 搜索多维表记录（支持服务端过滤）
 * 使用飞书原生的search API，支持精确筛选
 */
export async function searchBitableRecords(
  appToken: string,
  tableId: string,
  params: {
    filter?: {
      conjunction: string;
      conditions: Array<{
        field_name: string;
        operator: string;
        value: unknown[];
      }>;
    };
    page_size?: number;
    page_token?: string;
    sort?: string;
    field_names?: string[];
  },
  tokenType: "tenant" | "user" = "tenant"
): Promise<{
  items: Record<string, unknown>[];
  total: number;
  has_more: boolean;
  page_token?: string;
}> {
  const accessToken =
    tokenType === "tenant" ? await getTenantAccessToken() : "";

  const body: Record<string, unknown> = {};
  if (params.filter) body.filter = params.filter;
  if (params.page_size) body.page_size = params.page_size;
  if (params.page_token) body.page_token = params.page_token;
  if (params.sort) body.sort = params.sort;
  if (params.field_names) body.field_names = params.field_names;

  const res = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search?page_size=${params.page_size || 20}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to search records: ${data.msg}`);
  }

  return {
    items: (data.data?.items || []).map(
      (item: { fields?: Record<string, unknown>; record_id?: string }) => ({
        ...item.fields,
        _record_id: item.record_id,
      })
    ),
    total: data.data?.total || 0,
    has_more: data.data?.has_more || false,
    page_token: data.data?.page_token,
  };
}

/**
 * 获取多维表字段定义
 */
export async function listBitableFields(
  appToken: string,
  tableId: string,
  tokenType: "tenant" | "user" = "tenant"
): Promise<unknown[]> {
  const accessToken =
    tokenType === "tenant" ? await getTenantAccessToken() : "";

  const res = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to list fields: ${data.msg}`);
  }

  return data.data?.items || [];
}
