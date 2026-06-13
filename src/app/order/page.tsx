"use client";

import { useState, useCallback } from "react";
import { Box, Typography, Chip } from "@mui/material";
import DataTable, { ColumnDef, displayValue } from "@/components/DataTable";
import { useTableData, useTableFields } from "@/hooks/useTableData";
import { useCurrentStore } from "@/hooks/useStore";

const TABLE_NAME = "order";

// 订单状态编辑时可选项（过滤掉不可用/套餐自带安心保/伍剑/赵越）
const ORDER_EDITABLE_STATUSES = ["已完结", "逾期", "取消", "退款"];
const EMPTY_STATUS_DISPLAY = "进行中";

// 联动规则：订单状态 → 库存状态
const ORDER_TO_INVENTORY_MAP: Record<string, string> = {
  已完结: "return",   // 归还 → 对应仓库
  退款: "return",     // 退款 → 对应仓库
  取消: "return",     // 取消 → 对应仓库
  逾期: "出租",       // 逾期 → 仍在出租
};

export default function OrderPage() {
  const { storeId } = useCurrentStore();
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState<string>("");
  
  const { items, total, has_more, isLoading, error, mutate, page_token } = useTableData(
    storeId,
    TABLE_NAME,
    { page_size: 20, page_token: pageToken, search }
  );

  const { fields } = useTableFields(storeId, TABLE_NAME);

  // Phase 3: 补充8个字段 + 原有字段
  const orderColumns: ColumnDef[] = [
    { field: "订单号", headerName: "订单号", width: 150, editable: false },
    { field: "姓名", headerName: "姓名", width: 100 },
    { field: "手机号码", headerName: "手机", width: 120 },
    { field: "SN编码（最最重要）", headerName: "SN编码", width: 150, editable: false },
    { field: "租机型号", headerName: "设备型号", width: 150, editable: false },
    { field: "套餐", headerName: "套餐", width: 100 },
    { field: "发货平台", headerName: "平台", width: 100, type: "select" },
    {
      field: "状态",
      headerName: "订单状态",
      width: 120,
      type: "select",
      render: (value) => {
        const text = displayValue(value, EMPTY_STATUS_DISPLAY);
        const colorMap: Record<string, "success" | "warning" | "error" | "default" | "primary"> = {
          进行中: "primary",
          已完结: "success",
          逾期: "warning",
          取消: "default",
          退款: "error",
        };
        const color = colorMap[text] || "default";
        return <Chip label={text} size="small" color={color} variant="outlined" />;
      },
    },
    { field: "租期（天）", headerName: "租期", width: 80, type: "number" },
    { field: "租金", headerName: "租金", width: 100, type: "number" },
    { field: "快递费", headerName: "快递费", width: 80, type: "number" },
    { field: "安心保", headerName: "安心保", width: 80, type: "number" },
    { field: "发货日期", headerName: "预计发货", width: 120, type: "date" },
    { field: "实际发货日期", headerName: "实际发货", width: 120, type: "date" },
    { field: "归还日期（预估）", headerName: "预计归还", width: 120, type: "date" },
    { field: "实际入库日期", headerName: "实际入库", width: 120, type: "date" },
    { field: "备注", headerName: "备注", width: 200 },
  ];

  const columnsWithOptions = orderColumns.map((col) => {
    if (col.field === "状态") {
      const fieldDef = fields.find((f) => f.field_name === col.field);
      const allOptions = fieldDef?.property?.options?.map((opt) => ({
        label: opt.name,
        value: opt.name,
      })) || [];
      const editOptions = allOptions.filter((opt) =>
        ORDER_EDITABLE_STATUSES.includes(opt.value)
      );
      editOptions.unshift({ label: "进行中（清空状态）", value: "" });
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
    async (recordId: string, fields: Record<string, unknown>, currentRow?: Record<string, unknown>) => {
      const newStatus = String(fields["状态"] ?? "");
      const snCodeObj = currentRow ? currentRow["SN编码（最最重要）"] : fields["SN编码（最最重要）"];
      let snCode = "";
      if (Array.isArray(snCodeObj)) {
        snCodeObj.forEach((item) => {
          if (item && typeof item === "object" && "text" in item) {
            snCode = String((item as { text: string }).text);
          }
        });
      } else {
        snCode = String(snCodeObj ?? "");
      }

      if (newStatus !== "" && snCode && ORDER_TO_INVENTORY_MAP[newStatus] !== undefined) {
        const res = await fetch("/api/actions/order-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store: storeId,
            record_id: recordId,
            new_status: newStatus === "" ? null : newStatus,
            sn_code: snCode,
          }),
        });
        if (!res.ok) throw new Error("更新失败（联动）");
      } else {
        if (fields["状态"] === "") {
          fields["状态"] = null;
        }
        const res = await fetch(`/api/base/${storeId}/${TABLE_NAME}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ record_id: recordId, ...fields }),
        });
        if (!res.ok) throw new Error("更新失败");
      }
    },
    [storeId]
  );

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        订单管理
      </Typography>
      <DataTable
        title="订单列表"
        columns={columnsWithOptions}
        rows={items}
        total={total}
        isLoading={isLoading}
        error={error}
        hasMore={has_more}
        onPageChange={() => setPageToken(page_token)}
        onRefresh={() => mutate()}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        emptyDisplay={EMPTY_STATUS_DISPLAY}
        fieldDefs={fields}
        // Phase 3: 搜索功能
        searchValue={search}
        onSearchChange={setSearch}
      />
    </Box>
  );
}
