"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json());

export interface TableDataResult {
  items: Record<string, unknown>[];
  total: number;
  has_more: boolean;
  page_token?: string;
  page_tokens?: string[];  // 跳页时返回的中间页 token 列表
  isLoading: boolean;
  error: unknown;
  mutate: (data?: unknown, options?: { revalidate?: boolean }) => void;
}

export interface AdvancedSearch {
  field: string;  // 精确搜索字段名
  value: string;   // 精确搜索值
}

/**
 * 通用表格数据 hook
 * 注意：所有 Hook 必须在顶层调用，严禁条件 return，否则违反 React Hook 规则导致 #311 错误
 * @param storeId 店铺ID
 * @param tableName 表名 (device/inventory/order/repair)
 * @param params 查询参数
 */
export function useTableData(
  storeId: string,
  tableName: string,
  params?: {
    page_size?: number;
    page_token?: string;
    page_number?: number;  // 跳页：直接跳到第N页
    filter?: string;
    sort?: string;
    search?: string;  // 模糊搜索关键字
    advancedSearch?: AdvancedSearch;  // 高级搜索（精确匹配）
  }
): TableDataResult {
  // ========== 所有 Hook 必须在顶层调用 ==========

  // 高级搜索刷新计数器（强制 SWR 重新请求）
  const [refreshCounter, setRefreshCounter] = useState(0);

  // URL 中的 k 参数（访问 token）—— 只在客户端读取，避免 SSR/CSR 不一致
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const k = new URL(window.location.href).searchParams.get("k");
    if (k) setAccessToken(k);
  }, []);

  // 高级搜索变化时触发刷新计数器
  useEffect(() => {
    if (params?.advancedSearch?.field && params?.advancedSearch?.value) {
      setRefreshCounter(c => c + 1);
    }
  }, [params?.advancedSearch?.field, params?.advancedSearch?.value]);

  // ========== 构建 URL ==========

  let url: string | null = null;

  if (storeId && tableName) {
    const searchParams = new URLSearchParams();
    if (params?.page_size) searchParams.set("page_size", String(params.page_size));
    if (params?.page_token) searchParams.set("page_token", params.page_token);
    if (params?.page_number) searchParams.set("page_number", String(params.page_number));
    if (params?.filter) searchParams.set("filter", params.filter);
    if (params?.sort) searchParams.set("sort", params.sort);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.advancedSearch?.field && params?.advancedSearch?.value) {
      searchParams.set("search_mode", "exact");
      searchParams.set("search_field", params.advancedSearch.field);
      searchParams.set("search_value", params.advancedSearch.value);
    }
    if (accessToken) {
      searchParams.set("k", accessToken);
    }
    if (refreshCounter > 0) {
      searchParams.set("_refresh", String(refreshCounter));
    }
    url = `/api/base/${storeId}/${tableName}${searchParams.toString() ? "?" + searchParams.toString() : ""}`;
  }

  // storeId 为空时 url = null，SWR 自动跳过请求（但 hook 仍然被调用，不违反规则）
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 0, // 禁用 deduping，确保每次搜索都能发送新请求
  });

  return {
    items: data?.items || [],
    total: data?.total || 0,
    has_more: data?.has_more || false,
    page_token: data?.page_token,
    page_tokens: data?.page_tokens,
    isLoading,
    error,
    mutate,
  };
}

export interface FieldDefinition {
  field_id: string;
  field_name: string;
  type: number;
  ui_type?: string;  // 飞书字段UI类型
  property?: {
    options?: { id: string; name: string; color: number }[];
  };
}

/**
 * 获取表字段定义 hook
 */
export function useTableFields(
  storeId: string | null,
  tableName: string | null
) {
  const url =
    storeId && tableName
      ? `/api/base/${storeId}/${tableName}?action=fields`
      : null;

  const { data, error, isLoading } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // 字段定义不常变，缓存1分钟
  });

  return {
    fields: (data?.fields || []) as FieldDefinition[],
    isLoading,
    error,
  };
}
