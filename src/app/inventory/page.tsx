"use client";

import { useState, useCallback, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import DataTable, { ColumnDef } from "@/components/DataTable";
import { useTableData, useTableFields } from "@/hooks/useTableData";
import { useCurrentStore } from "@/hooks/useStore";

const TABLE_NAME = "inventory";

// P0-003修复：删除不存在的列（所在仓库、更新时间），修正库存状态为状态
// 库存状态表列定义
const inventoryColumns: ColumnDef[] = [
  { field: "SN编码", headerName: "SN编码", width: 150, editable: false },
  { field: "设备型号", headerName: "设备型号", width: 150, editable: false },
  { field: "分类", headerName: "分类", width: 120, editable: false },
  { field: "状态", headerName: "状态", width: 150, type: "select" },
];

// 库存状态编辑时可选项（过滤掉不相关选项）
const INVENTORY_EDITABLE_OPTIONS = [
  "出租",
  "南通仓",
  "上海仓",
  "供应商（深圳）",
  "供应商（上海）",
  "供应商（淄博）",
];

export default function InventoryPage() {
  const { storeId } = useCurrentStore();
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [advancedSearch, setAdvancedSearch] = useState<{ field: string; value: string } | undefined>(undefined);
  
  const { items, total, has_more, isLoading, error, mutate, page_token } = useTableData(
    storeId,
    TABLE_NAME,
    { page_size: 20, page_token: pageToken, search: advancedSearch ? undefined : searchKeyword, advancedSearch }
  );

  const { fields } = useTableFields(storeId, TABLE_NAME);
  
  // P1-RE-002-fix2: 获取设备表的字段定义，用于Lookup字段的options映射
  const { fields: deviceFields } = useTableFields(storeId, "device");
  
  // 提取设备表的"设备型号"和"分类"选项，用于库存表Lookup字段显示
  const extraOptions = useMemo(() => {
    const options: { id: string; name: string }[] = [];
    if (deviceFields) {
      // 设备型号
      const deviceModelField = deviceFields.find((f) => f.field_name === "设备型号");
      if (deviceModelField?.property?.options) {
        options.push(...deviceModelField.property.options);
      }
      // 分类
      const categoryField = deviceFields.find((f) => f.field_name === "分类");
      if (categoryField?.property?.options) {
        options.push(...categoryField.property.options);
      }
    }
    return options;
  }, [deviceFields]);

  const columnsWithOptions = inventoryColumns.map((col) => {
    // P0-003修复：库存状态字段名改为"状态"
    if (col.field === "状态") {
      const fieldDef = fields.find((f) => f.field_name === col.field);
      const allOptions = fieldDef?.property?.options?.map((opt) => ({
        label: opt.name,
        value: opt.name,
      })) || [];
      const editOptions = allOptions.filter((opt) =>
        INVENTORY_EDITABLE_OPTIONS.includes(opt.value)
      );
      return { ...col, options: editOptions };
    }
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

  const handleUpdate = useCallback(
    async (recordId: string, fields: Record<string, unknown>) => {
      // P0-003修复：库存状态改为状态，是 multiple select，前端按单选处理：替换而非追加
      if (fields["状态"] && typeof fields["状态"] === "string") {
        fields["状态"] = [fields["状态"]];
      }
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
    setPageToken(undefined); // 重置分页
  }, []);

  // 高级搜索处理
  const handleAdvancedSearch = useCallback((field: string, value: string) => {
    setAdvancedSearch({ field, value });
    setSearchKeyword(""); // 清除模糊搜索
    setPageToken(undefined); // 重置分页
  }, []);

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        库存管理
      </Typography>
      <DataTable
        title="库存列表"
        columns={columnsWithOptions}
        rows={items}
        total={total}
        isLoading={isLoading}
        error={error}
        hasMore={has_more}
        onPageChange={() => setPageToken(page_token)}
        onRefresh={() => mutate()}
        onSearch={handleSearch}
        onAdvancedSearch={handleAdvancedSearch}
        onUpdate={handleUpdate}
        emptyDisplay="-"
        // P1-006修复：传递字段定义用于映射 formula/lookup 选项ID
        fieldDefs={fields}
        // P1-RE-002-fix2: 传递设备表的options用于Lookup字段显示
        extraOptions={extraOptions}
      />
    </Box>
  );
}
