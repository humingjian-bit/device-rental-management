"use client";

import { useState, useCallback } from "react";
import { Box, Typography } from "@mui/material";
import DataTable, { ColumnDef } from "@/components/DataTable";
import { useTableData, useTableFields } from "@/hooks/useTableData";
import { useCurrentStore } from "@/hooks/useStore";

const TABLE_NAME = "repair";

// 维修管理表列定义
const repairColumns: ColumnDef[] = [
  { field: "SN编码", headerName: "SN编码", width: 150, editable: false },
  { field: "设备型号", headerName: "设备型号", width: 150, editable: false },
  { field: "维修原因", headerName: "维修原因", width: 200 },
  { field: "维修状态", headerName: "维修状态", width: 120, type: "select" },
  { field: "维修费用", headerName: "维修费用", width: 100, type: "number" },
  { field: "送修日期", headerName: "送修日期", width: 120, type: "date" },
  { field: "预计归还", headerName: "预计归还", width: 120, type: "date" },
  { field: "备注", headerName: "备注", width: 200 },
];

export default function RepairPage() {
  const { storeId } = useCurrentStore();
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const { items, total, has_more, isLoading, error, mutate } = useTableData(
    storeId,
    TABLE_NAME,
    { page_size: 20, page_token: pageToken }
  );

  const { fields } = useTableFields(storeId, TABLE_NAME);

  const columnsWithOptions = repairColumns.map((col) => {
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

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        维修管理
      </Typography>
      <DataTable
        title="维修记录"
        columns={columnsWithOptions}
        rows={items}
        total={total}
        isLoading={isLoading}
        error={error}
        hasMore={has_more}
        onPageChange={() => setPageToken(undefined)}
        onRefresh={() => mutate()}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        emptyDisplay="-"
      />
    </Box>
  );
}
