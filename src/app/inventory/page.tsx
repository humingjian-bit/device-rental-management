"use client";

import { useState, useCallback } from "react";
import { Box, Typography } from "@mui/material";
import DataTable, { ColumnDef } from "@/components/DataTable";
import { useTableData, useTableFields } from "@/hooks/useTableData";
import { useCurrentStore } from "@/hooks/useStore";

const TABLE_NAME = "inventory";

// 库存状态表列定义
const inventoryColumns: ColumnDef[] = [
  { field: "SN编码", headerName: "SN编码", width: 150, editable: false },
  { field: "设备型号", headerName: "设备型号", width: 150, editable: false },
  { field: "库存状态", headerName: "库存状态", width: 150, type: "select" },
  { field: "所在仓库", headerName: "所在仓库", width: 120, type: "select" },
  { field: "更新时间", headerName: "更新时间", width: 150, editable: false },
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
  const { items, total, has_more, isLoading, error, mutate } = useTableData(
    storeId,
    TABLE_NAME,
    { page_size: 20, page_token: pageToken }
  );

  const { fields } = useTableFields(storeId, TABLE_NAME);

  const columnsWithOptions = inventoryColumns.map((col) => {
    if (col.field === "库存状态") {
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
      // 库存状态是 multiple select，前端按单选处理：替换而非追加
      if (fields["库存状态"] && typeof fields["库存状态"] === "string") {
        fields["库存状态"] = [fields["库存状态"]];
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
        onPageChange={() => setPageToken(undefined)}
        onRefresh={() => mutate()}
        onUpdate={handleUpdate}
        emptyDisplay="-"
      />
    </Box>
  );
}
