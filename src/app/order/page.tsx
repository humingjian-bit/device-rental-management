"use client";

import { useState, useCallback, useMemo } from "react";
import { Box, Typography, Chip } from "@mui/material";
import DataTable, { ColumnDef, displayValue } from "@/components/DataTable";
import { useTableData, useTableFields } from "@/hooks/useTableData";
import { useCurrentStore } from "@/hooks/useStore";

const TABLE_NAME = "order";

// 排除的系统关联字段（不显示）
const EXCLUDED_FIELDS = ["父记录", "父记录 2", "父节点"];

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

// 状态字段的彩色标签映射
const STATUS_COLOR_MAP: Record<string, "success" | "warning" | "error" | "default" | "primary"> = {
  进行中: "primary",
  已完结: "success",
  逾期: "warning",
  取消: "default",
  退款: "error",
};

// 根据字段类型推断列类型
function getColumnType(fieldName: string, fieldType: number, uiType?: string): "text" | "select" | "date" | "number" | undefined {
  // 状态字段
  if (fieldName === "状态") return "select";
  
  // 日期字段
  if (uiType === "Date" || fieldType === 5) return "date";
  
  // 数字字段（租金、净收益等）
  if (uiType === "Number" || fieldType === 1) return "number";
  
  // 单选/多选字段
  if (uiType === "SingleSelect" || fieldType === 3) return "select";
  if (uiType === "MultipleSelect" || fieldType === 4) return "select";
  
  return "text";
}

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

  // 修复：获取库存表字段定义，用于订单表SingleLink字段显示
  const { fields: inventoryFields } = useTableFields(storeId, "inventory");
  
  // 提取库存表的"SN编码"选项，用于订单表SingleLink字段显示
  const extraOptions = useMemo(() => {
    const options: { id: string; name: string }[] = [];
    if (inventoryFields) {
      const snField = inventoryFields.find((f) => f.field_name === "SN编码");
      if (snField?.property?.options) {
        options.push(...snField.property.options);
      }
    }
    return options;
  }, [inventoryFields]);

  // 动态生成列：根据飞书字段定义，按原有顺序显示所有字段（除系统关联字段）
  const orderColumns: ColumnDef[] = useMemo(() => {
    if (!fields || fields.length === 0) {
      // 如果字段还没加载，返回空数组
      return [];
    }

    // 按飞书原有顺序生成列（fields已经是按飞书顺序排列的）
    const columns: ColumnDef[] = [];
    
    for (const field of fields) {
      // 排除系统关联字段
      if (EXCLUDED_FIELDS.includes(field.field_name)) {
        continue;
      }

      const columnType = getColumnType(field.field_name, field.type, field.ui_type);
      
      // 特殊处理状态字段
      if (field.field_name === "状态") {
        columns.push({
          field: field.field_name,
          headerName: field.field_name,
          width: 120,
          type: "select",
          render: (value) => {
            const text = displayValue(value, EMPTY_STATUS_DISPLAY);
            const color = STATUS_COLOR_MAP[text] || "default";
            return <Chip label={text} size="small" color={color} variant="outlined" />;
          },
        });
        continue;
      }

      // 根据字段类型设置宽度
      let width = 150;
      if (field.field_name === "备注") width = 200;
      if (field.field_name === "订单号") width = 150;
      if (field.ui_type === "Number" || field.type === 1) width = 100;
      if (field.ui_type === "Date" || field.type === 5) width = 120;
      if (columnType === "select") width = 120;

      columns.push({
        field: field.field_name,
        headerName: field.field_name,
        width,
        type: columnType,
      });
    }

    return columns;
  }, [fields]);

  // 为列添加选项数据
  const columnsWithOptions = useMemo(() => {
    return orderColumns.map((col) => {
      // 订单状态字段特殊处理
      if (col.field === "状态") {
        const fieldDef = fields?.find((f) => f.field_name === col.field);
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
      
      // 其他select类型字段
      if (col.type === "select") {
        const fieldDef = fields?.find((f) => f.field_name === col.field);
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
  }, [orderColumns, fields]);

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
      // 如果订单状态发生了变化，使用联动API
      const newStatus = String(fields["状态"] ?? "");
      // SN编码是SingleLink类型，更新时从当前行数据中读取原始值
      // 查找SN编码相关字段（可能是"SN编码"或"SN编码（最最重要）"）
      let snCodeObj = currentRow ? currentRow["SN编码"] ?? currentRow["SN编码（最最重要）"] : null;
      if (!snCodeObj) {
        snCodeObj = fields["SN编码"] ?? fields["SN编码（最最重要）"];
      }
      let snCode = "";
      if (Array.isArray(snCodeObj)) {
        // SingleLink类型返回 [{text: "xxx", record_ids: [...]}]
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

  // 高级搜索处理 - 同步更新状态，确保 SWR 正确触发
  const handleAdvancedSearch = useCallback((field: string, value: string) => {
    // 使用函数式更新确保状态正确
    setAdvancedSearch({ field, value });
    setSearchKeyword(""); // 清除模糊搜索
    setPageToken(undefined); // 重置分页
  }, []);

  // 清除高级搜索
  const handleClearAdvancedSearch = useCallback(() => {
    setAdvancedSearch(undefined);
    setPageToken(undefined);
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
        nextPageToken={page_token}
        onPageChange={(token) => setPageToken(token)}
        onRefresh={() => mutate()}
        onSearch={handleSearch}
        onAdvancedSearch={handleAdvancedSearch}
        onClearAdvancedSearch={handleClearAdvancedSearch}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        emptyDisplay={EMPTY_STATUS_DISPLAY}
        // 传递字段定义用于映射 formula/lookup 选项ID
        fieldDefs={fields}
        // 传递库存表options用于订单表SingleLink字段显示
        extraOptions={extraOptions}
      />
    </Box>
  );
}
