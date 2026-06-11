"use client";

import { useState, useCallback } from "react";
import { Box, Typography } from "@mui/material";
import DataTable, { ColumnDef } from "@/components/DataTable";
import { useTableData, useTableFields } from "@/hooks/useTableData";
import { useCurrentStore } from "@/hooks/useStore";

const TABLE_NAME = "device";

// 设备信息表列定义（映射飞书多维表字段）
const deviceColumns: ColumnDef[] = [
  { field: "SN编码", headerName: "SN编码", width: 150, editable: false },
  { field: "设备型号", headerName: "设备型号", width: 150 },
  { field: "分类", headerName: "分类", width: 120, type: "select" },
  { field: "品牌", headerName: "品牌", width: 100 },
  { field: "购入日期", headerName: "购入日期", width: 120, type: "date" },
  { field: "购入价格", headerName: "购入价格", width: 100, type: "number" },
  { field: "押金", headerName: "押金", width: 100, type: "number" },
  { field: "日租金", headerName: "日租金", width: 100, type: "number" },
  { field: "备注", headerName: "备注", width: 200 },
];

export default function DevicePage() {
  const { storeId } = useCurrentStore();
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const { items, total, has_more, isLoading, error, mutate } = useTableData(
    storeId,
    TABLE_NAME,
    { page_size: 20, page_token: pageToken }
  );

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
        onPageChange={() => setPageToken(undefined)}
        onRefresh={() => mutate()}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        emptyDisplay="-"
      />
    </Box>
  );
}
