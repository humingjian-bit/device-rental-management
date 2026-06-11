"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface TableDataResult {
  items: Record<string, unknown>[];
  total: number;
  has_more: boolean;
  page_token?: string;
  isLoading: boolean;
  error: unknown;
  mutate: () => void;
}

/**
 * 通用表格数据 hook
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
    filter?: string;
    sort?: string;
  }
): TableDataResult {
  const searchParams = new URLSearchParams();
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));
  if (params?.page_token) searchParams.set("page_token", params.page_token);
  if (params?.filter) searchParams.set("filter", params.filter);
  if (params?.sort) searchParams.set("sort", params.sort);

  const url = `/api/base/${storeId}/${tableName}${searchParams.toString() ? "?" + searchParams.toString() : ""}`;

  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  return {
    items: data?.items || [],
    total: data?.total || 0,
    has_more: data?.has_more || false,
    page_token: data?.page_token,
    isLoading,
    error,
    mutate,
  };
}

export interface FieldDefinition {
  field_id: string;
  field_name: string;
  type: number;
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
