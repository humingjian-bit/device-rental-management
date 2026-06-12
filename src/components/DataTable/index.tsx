"use client";

import React, { useState, useCallback } from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Typography,
  Chip,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import {
  Edit as EditIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";

export interface FieldDef {
  field_name: string;
  type: number;
  property?: {
    options?: Array<{ name: string; id: string }>;
  };
}

export interface ColumnDef {
  field: string;
  headerName: string;
  width?: number;
  type?: "text" | "select" | "number" | "date";
  editable?: boolean;
  options?: { label: string; value: string }[];
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface DataTableProps {
  title: string;
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  total: number;
  isLoading: boolean;
  error: unknown;
  pageToken?: string;
  hasMore: boolean;
  onPageChange: (pageToken?: string) => void;
  onRefresh: () => void;
  onCreate?: (fields: Record<string, unknown>) => Promise<void>;
  onUpdate?: (recordId: string, fields: Record<string, unknown>, currentRow?: Record<string, unknown>) => Promise<void>;
  pageSize?: number;
  emptyDisplay?: string;
  fieldDefs?: FieldDef[]; // P1-006: 用于映射 formula/lookup 字段的选项ID
}

/**
 * P1-005修复：日期时间戳格式化
 * 格式化为 YYYY-MM-DD
 */
function formatDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  
  // 数字类型：毫秒级时间戳（> 1000000000000）
  if (typeof value === "number" && value > 1000000000000) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  
  // 字符串类型：尝试解析日期格式
  if (typeof value === "string") {
    // 已经是 YYYY-MM-DD 格式
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    // ISO 格式
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  
  return null;
}

/**
 * P1-006修复：映射选项ID为选项名称
 * 用于 formula(type=19) 和 lookup(type=18) 字段
 */
function mapOptionIdsToNames(value: unknown, fieldDef?: FieldDef): string {
  if (!fieldDef || !fieldDef.property?.options) {
    return String(value);
  }

  const options = fieldDef.property.options;
  
  // 如果是数组（如 formula 返回的选项ID数组）
  if (Array.isArray(value)) {
    const names: string[] = [];
    for (const item of value) {
      if (typeof item === "string" && item.startsWith("opt")) {
        // 查找对应的选项名称
        const option = options.find((opt) => opt.id === item);
        if (option) {
          names.push(option.name);
        }
      } else if (typeof item === "object" && item !== null && "text" in item) {
        // lookup 类型：{text: "xxx", record_ids: [...]}
        names.push(String((item as { text: string }).text));
      } else {
        names.push(String(item));
      }
    }
    return names.join(", ");
  }
  
  // 如果是单个字符串选项ID
  if (typeof value === "string" && value.startsWith("opt")) {
    const option = options.find((opt) => opt.id === value);
    return option ? option.name : value;
  }
  
  return String(value);
}

/**
 * 空值显示映射
 */
function displayValue(value: unknown, emptyDisplay = "-", fieldDef?: FieldDef): string {
  if (value === null || value === undefined || value === "") return emptyDisplay;
  
  // P1-005修复：日期格式化
  const formattedDate = formatDate(value);
  if (formattedDate) return formattedDate;
  
  if (Array.isArray(value)) {
    // P1-006修复：处理 lookup 类型 [{text: "xxx", record_ids: [...]}]
    if (value.length > 0 && typeof value[0] === "object" && "text" in (value[0] as object)) {
      const texts = value.map((item) => {
        if (typeof item === "object" && item !== null && "text" in item) {
          return String((item as { text: string }).text);
        }
        return String(item);
      });
      return texts.join(", ");
    }
    // P1-006修复：处理公式/选项ID数组
    if (value.length > 0 && typeof value[0] === "string" && (value[0] as string).startsWith("opt")) {
      return mapOptionIdsToNames(value, fieldDef);
    }
    return value.length > 0 ? value.join(", ") : emptyDisplay;
  }
  
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.text) return String(obj.text);
    if (obj.name) return String(obj.name);
    return JSON.stringify(value);
  }
  
  return String(value);
}

/**
 * 从飞书字段值提取原始值用于编辑
 */
function extractEditValue(value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (obj.text !== undefined) return obj.text;
    if (obj.name !== undefined) return obj.name;
  }
  return value;
}

export default function DataTable({
  title,
  columns,
  rows,
  total,
  isLoading,
  error,
  hasMore,
  onPageChange,
  onRefresh,
  onCreate,
  onUpdate,
  pageSize = 20,
  emptyDisplay = "-",
  fieldDefs = [],
}: DataTableProps) {
  const [searchText, setSearchText] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Record<string, unknown> | null>(null);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [isCreate, setIsCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredRows = searchText
    ? rows.filter((row) =>
        columns.some((col) => {
          const val = row[col.field];
          return String(val ?? "").toLowerCase().includes(searchText.toLowerCase());
        })
      )
    : rows;

  const handleEdit = useCallback((row: Record<string, unknown>) => {
    setEditRecord(row);
    setIsCreate(false);
    const fields: Record<string, unknown> = {};
    columns.forEach((col) => {
      if (col.editable !== false) {
        fields[col.field] = extractEditValue(row[col.field]);
      }
    });
    setEditFields(fields);
    setEditDialogOpen(true);
  }, [columns]);

  const handleCreate = useCallback(() => {
    setEditRecord(null);
    setIsCreate(true);
    const fields: Record<string, unknown> = {};
    columns.forEach((col) => {
      if (col.editable !== false) {
        fields[col.field] = "";
      }
    });
    setEditFields(fields);
    setEditDialogOpen(true);
  }, [columns]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isCreate && onCreate) {
        await onCreate(editFields);
      } else if (editRecord && onUpdate) {
        const recordId = String(editRecord._record_id || "");
        if (recordId) {
          // P0-002修复：传递当前行数据，用于 lookup 字段处理
          await onUpdate(recordId, editFields, editRecord);
        }
      }
      setEditDialogOpen(false);
      onRefresh();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field: string, value: unknown) => {
    setEditFields((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectChange = (field: string, event: SelectChangeEvent<string>) => {
    setEditFields((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const colSpan = columns.length + (onUpdate ? 1 : 0);

  return (
    <Box>
      {/* 工具栏 */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <TextField
          size="small"
          placeholder="搜索..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          sx={{ width: 300 }}
        />
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton onClick={onRefresh} title="刷新">
            <RefreshIcon />
          </IconButton>
          {onCreate && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleCreate}
            >
              新增
            </Button>
          )}
        </Box>
      </Box>

      {/* 表格 */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.field}
                  sx={{ fontWeight: "bold", minWidth: col.width || 120 }}
                >
                  {col.headerName}
                </TableCell>
              ))}
              {onUpdate && (
                <TableCell sx={{ fontWeight: "bold", width: 60 }} align="center">
                  操作
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
                  <Typography color="error">加载失败，请重试</Typography>
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">暂无数据</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row, idx) => {
                // P1-006修复：获取当前行数据的字段定义
                const getFieldDef = (fieldName: string) => {
                  return fieldDefs.find((f) => f.field_name === fieldName);
                };
                
                return (
                  <TableRow key={String(row._record_id || idx)} hover>
                    {columns.map((col) => {
                      const fieldDef = getFieldDef(col.field);
                      return (
                        <TableCell key={col.field}>
                          {col.render ? (
                            col.render(row[col.field], row)
                          ) : col.type === "select" && row[col.field] ? (
                            <Chip
                              label={displayValue(row[col.field], emptyDisplay, fieldDef)}
                              size="small"
                              variant="outlined"
                            />
                          ) : (
                            displayValue(row[col.field], emptyDisplay, fieldDef)
                          )}
                        </TableCell>
                      );
                    })}
                    {onUpdate && (
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => handleEdit(row)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 分页 */}
      {hasMore && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
          <Button size="small" onClick={() => onPageChange()}>
            加载更多
          </Button>
        </Box>
      )}

      {/* 编辑/新增对话框 */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{isCreate ? "新增" : "编辑"}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {columns
              .filter((col) => col.editable !== false)
              .map((col) => (
                <Box key={col.field}>
                  {col.type === "select" && col.options ? (
                    <FormControl fullWidth size="small">
                      <InputLabel>{col.headerName}</InputLabel>
                      <Select
                        value={String(editFields[col.field] || "")}
                        label={col.headerName}
                        onChange={(e) => handleSelectChange(col.field, e)}
                      >
                        <MenuItem value="">
                          <em>请选择</em>
                        </MenuItem>
                        {col.options.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <TextField
                      fullWidth
                      label={col.headerName}
                      value={editFields[col.field] || ""}
                      onChange={(e) => handleFieldChange(col.field, e.target.value)}
                      type={col.type === "number" ? "number" : "text"}
                      size="small"
                    />
                  )}
                </Box>
              ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export { displayValue, extractEditValue };
