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
  const [searchKeyword, setSearchKeyword] = useState("");
  const [advancedSearch, setAdvancedSearch] = useState<{ field: string; value: string } | undefined>(undefined);
  
  const { items, total, has_more, isLoading, error, mutate, page_token } = useTableData(
    storeId,
    TABLE_NAME,
    { page_size: 20, page_token: pageToken, search: advancedSearch ? undefined : searchKeyword, advancedSearch }
  );

  const { fields } = useTableFields(storeId, TABLE_NAME);

  // P0-002修复：修正字段名，SN编码是lookup类型需要特殊处理
  const orderColumns: ColumnDef[] = [
    { field: "订单号", headerName: "订单号", width: 150, editable: false },
    { field: "SN编码（最最重要）", headerName: "SN编码（最最重要）", width: 150, editable: false },
    { field: "租机型号", headerName: "租机型号", width: 150, editable: false },
    { field: "发货平台", headerName: "发货平台", width: 100, type: "select" },
    {
      field: "状态",
      headerName: "状态",
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
    { field: "发货日期", headerName: "发货日期", width: 120, type: "date" },
    { field: "归还日期（预估）", headerName: "归还日期（预估）", width: 120, type: "date" },
    { field: "租金", headerName: "租金", width: 100, type: "number" },
    { field: "备注", headerName: "备注", width: 200 },
  ];

  const columnsWithOptions = orderColumns.map((col) => {
    // P0-002修复：订单状态字段名改为"状态"
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
      // P0-002修复：字段名改为"状态"，SN编码改为"SN编码（最最重要）"
      // 如果订单状态发生了变化，使用联动API
      const newStatus = String(fields["状态"] ?? "");
      // SN编码是lookup类型，更新时从当前行数据中读取原始值
      const snCodeObj = currentRow ? currentRow["SN编码（最最重要）"] : fields["SN编码（最最重要）"];
      let snCode = "";
      if (Array.isArray(snCodeObj)) {
        // lookup类型返回 [{text: "xxx", record_ids: [...]}]
        snCodeObj.forEach((item) => {
          if (item && typeof item === "object" && "text" in item) {
            snCode = String((item as { text: string }).text);
          }
        });
      } else {
        snCode = String(snCodeObj ?? "");
      }

      if (newStatus !== "" && snCode && ORDER_TO_INVENTORY_MAP[newStatus] !== undefined) {
        // 使用联动API
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
        // 普通更新
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
        onSearch={handleSearch}
        onAdvancedSearch={handleAdvancedSearch}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        emptyDisplay={EMPTY_STATUS_DISPLAY}
        // P1-006修复：传递字段定义用于映射 formula/lookup 选项ID
        fieldDefs={fields}
      />
    </Box>
  );
}
