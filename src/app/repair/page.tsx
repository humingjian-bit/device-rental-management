"use client";

import { useState, useCallback, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import DataTable, { ColumnDef } from "@/components/DataTable";
import { useTableData, useTableFields } from "@/hooks/useTableData";
import { useCurrentStore } from "@/hooks/useStore";

const TABLE_NAME = "repair";

// P0-004修复：修正字段名，删除不存在的列（维修状态）
// 维修管理表列定义
const repairColumns: ColumnDef[] = [
  { field: "SN编码", headerName: "SN编码", width: 150, editable: false },
  { field: "型号", headerName: "设备型号", width: 150, editable: false },
  { field: "故障描述", headerName: "维修原因", width: 200 },
  { field: "维修价格", headerName: "维修费用", width: 100, type: "number" },
  { field: "送修日期", headerName: "送修日期", width: 120, type: "date" },
  { field: "维修返日期", headerName: "预计归还", width: 120, type: "date" },
  { field: "备注", headerName: "备注", width: 200 },
];

export default function RepairPage() {
  const { storeId } = useCurrentStore();
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [searchKeyword, setSearchKeyword] = useState("");
  
  const { items, total, has_more, isLoading, error, mutate, page_token } = useTableData(
    storeId,
    TABLE_NAME,
    { page_size: 20, page_token: pageToken, search: searchKeyword }
  );

  const { fields } = useTableFields(storeId, TABLE_NAME);
  
  // P1-RE-002-fix2: 获取设备表的字段定义，用于Lookup字段的options映射
  const { fields: deviceFields } = useTableFields(storeId, "device");
  
  // 提取设备表的"设备型号"选项，用于维修表Lookup字段显示
  const extraOptions = useMemo(() => {
    const options: { id: string; name: string }[] = [];
    if (deviceFields) {
      // 设备型号
      const deviceModelField = deviceFields.find((f) => f.field_name === "设备型号");
      if (deviceModelField?.property?.options) {
        options.push(...deviceModelField.property.options);
      }
    }
    return options;
  }, [deviceFields]);

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

  // 搜索处理：清空分页，重新搜索
  const handleSearch = useCallback((keyword: string) => {
    setSearchKeyword(keyword);
    setPageToken(undefined); // 重置分页
  }, []);

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
        onPageChange={() => setPageToken(page_token)}
        onRefresh={() => mutate()}
        onSearch={handleSearch}
        onCreate={handleCreate}
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
