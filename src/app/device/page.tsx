"use client";

import { useState, useCallback, useEffect } from "react";
import { Box, Typography } from "@mui/material";
import DataTable, { ColumnDef } from "@/components/DataTable";
import { useTableData, useTableFields } from "@/hooks/useTableData";
import { useCurrentStore } from "@/hooks/useStore";

const TABLE_NAME = "device";

// 设备信息表列定义（映射飞书多维表字段）
// P0-001修复：删除不存在的字段（品牌、押金、日租金），修正字段名，补充有用字段
const deviceColumns: ColumnDef[] = [
  { field: "SN编码", headerName: "SN编码", width: 150, editable: false },
  { field: "设备型号", headerName: "设备型号", width: 150 },
  { field: "分类", headerName: "分类", width: 120, type: "select" },
  { field: "采购日期", headerName: "采购日期", width: 120, type: "date" },
  { field: "采购价格", headerName: "采购价格", width: 100, type: "number" },
  { field: "颜色", headerName: "颜色", width: 80, type: "select" },
  { field: "采购商", headerName: "采购商", width: 120, type: "select" },
  { field: "归属", headerName: "归属", width: 120, type: "select" },
  { field: "发票", headerName: "发票", width: 100, type: "select" },
  { field: "备注", headerName: "备注", width: 200 },
];

export default function DevicePage() {
  const { storeId } = useCurrentStore();
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [advancedSearch, setAdvancedSearch] = useState<{ field: string; value: string } | undefined>(undefined);
  const [cachedTokens, setCachedTokens] = useState<string[]>([]);
  const [isJumping, setIsJumping] = useState(false);
  const [jumpedPage, setJumpedPage] = useState<number | undefined>(undefined);
  
  const { items, total, has_more, isLoading, error, mutate, page_token, page_tokens } = useTableData(
    storeId,
    TABLE_NAME,
    { page_size: 20, page_token: pageToken, search: advancedSearch ? undefined : searchKeyword, advancedSearch }
  );

  // 收集跳页返回的中间页 token
  useEffect(() => {
    if (page_tokens && page_tokens.length > 0) {
      setCachedTokens(prev => {
        const merged = [...prev];
        for (let i = 0; i < page_tokens.length; i++) {
          if (page_tokens[i]) merged[i] = page_tokens[i];
        }
        return merged;
      });
    }
  }, [page_tokens]);

  // 跳页处理：通过后端 page_number 快速遍历到目标页
  const handleJumpToPage = useCallback(async (pageNumber: number) => {
    setIsJumping(true);
    try {
      const params = new URLSearchParams({ page_size: "20", page_number: String(pageNumber) });
      if (advancedSearch?.field && advancedSearch?.value) {
        params.set("search_mode", "exact");
        params.set("search_field", advancedSearch.field);
        params.set("search_value", advancedSearch.value);
      } else if (searchKeyword) {
        params.set("search", searchKeyword);
      }
      const res = await fetch(`/api/base/${storeId}/${TABLE_NAME}?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();
      if (data.items) {
        mutate(data, { revalidate: false });
        setPageToken(data.page_token);
        setJumpedPage(pageNumber - 1); // 0-based
        if (data.page_tokens) {
          setCachedTokens(prev => {
            const merged = [...prev];
            for (let i = 0; i < data.page_tokens.length; i++) {
              if (data.page_tokens[i]) merged[i] = data.page_tokens[i];
            }
            return merged;
          });
        }
      }
    } catch (e) {
      console.error("Jump to page failed:", e);
    } finally {
      setIsJumping(false);
    }
  }, [storeId, advancedSearch, searchKeyword, mutate]);

  const { fields, isLoading: fieldsLoading } = useTableFields(storeId, TABLE_NAME);

  const columnsWithOptions = deviceColumns.map((col) => {
    if (col.type === "select") {
      const fieldDef = fields.find((f) => f.field_name === col.field);
      if (fieldDef?.property?.options) {
        return {
          ...col,
          options: fieldDef.property.options.map((opt) => ({
            label: opt.name,
            value: opt.name,
          })),
        };
      }
    }
    return col;
  });

  const handleCreate = useCallback(
    async (fields: Record<string, unknown>) => {
      const res = await fetch(`/api/base/${storeId}/${TABLE_NAME}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("创建失败");
    },
    [storeId]
  );

  const handleUpdate = useCallback(
    async (recordId: string, fields: Record<string, unknown>) => {
      const res = await fetch(`/api/base/${storeId}/${TABLE_NAME}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_id: recordId, ...fields }),
      });
      if (!res.ok) throw new Error("更新失败");
    },
    [storeId]
  );

  // 搜索处理：清空分页，重新搜索
  const handleSearch = useCallback((keyword: string) => {
    setSearchKeyword(keyword);
    setAdvancedSearch(undefined); // 清除高级搜索
    setPageToken(undefined);
    setCachedTokens([]);
    setJumpedPage(undefined); // 重置分页
  }, []);

  // 高级搜索处理
  const handleAdvancedSearch = useCallback((field: string, value: string) => {
    setAdvancedSearch({ field, value });
    setSearchKeyword(""); // 清除模糊搜索
    setPageToken(undefined);
    setCachedTokens([]);
    setJumpedPage(undefined); // 重置分页
  }, []);

  // 清除高级搜索
  const handleClearAdvancedSearch = useCallback(() => {
    setAdvancedSearch(undefined);
    setPageToken(undefined);
    setCachedTokens([]);
    setJumpedPage(undefined);
  }, []);

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        设备管理
      </Typography>
      <DataTable
        title="设备列表"
        columns={columnsWithOptions}
        rows={items}
        total={total}
        isLoading={isLoading || fieldsLoading}
        error={error}
        hasMore={has_more}
        nextPageToken={page_token}
        onPageChange={(token) => setPageToken(token)}
        onRefresh={() => mutate()}
        onSearch={handleSearch}
        onAdvancedSearch={handleAdvancedSearch}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onJumpToPage={handleJumpToPage}
        cachedTokens={cachedTokens}
        isJumping={isJumping}
        externalCurrentPage={jumpedPage}
        emptyDisplay="-"
        // P1-006修复：传递字段定义用于映射 formula/lookup 选项ID
        fieldDefs={fields}
      />
    </Box>
  );
}
