"use client";

import React, { useState, useCallback, useEffect } from "react";
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
  Search as SearchIcon,
  Clear as ClearIcon,
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
  onSearch?: (keyword: string) => void;  // 搜索回调
  onCreate?: (fields: Record<string, unknown>) => Promise<void>;
  onUpdate?: (recordId: string, fields: Record<string, unknown>, currentRow?: Record<string, unknown>) => Promise<void>;
  pageSize?: number;
  emptyDisplay?: string;
  fieldDefs?: FieldDef[];
  extraOptions?: { id: string; name: string }[];
}

/**
 * P1-005修复：日期时间戳格式化
 * 格式化为 YYYY-MM-DD
 * P1-RE-001修复：避免将小数字符串误判为日期
 */
function formatDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  
  // P1-RE-001修复：如果值是小数字符串（如"8600"），不是日期
  if (typeof value === "string") {
    // 已经是 YYYY-MM-DD 格式
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    // ISO 格式（包含T或更长格式）
    if (value.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }
    // 纯年份或小数字符串（如"8600"、"1951"）不是日期
    return null;
  }
  
  // 数字类型：毫秒级时间戳（> 1000000000000）
  if (typeof value === "number" && value > 1000000000000) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  
  // P1-RE-001修复：纯数字（采购价格、租期天数等）不是日期
  return null;
}

/**
 * P1-006修复 + P1-RE-002修复：映射选项ID为选项名称
 * 用于 formula(type=19) 和 lookup(type=18) 字段
 * P1-RE-002：lookup字段的options可能在关联表字段定义中，需要额外查找
 */
function mapOptionIdsToNames(value: unknown, fieldDef?: FieldDef, allFieldDefs?: FieldDef[], extraOptions?: { id: string; name: string }[]): string {
  if (!fieldDef) {
    // P1-RE-002修复：如果没有fieldDef但值是optXXX格式，尝试从所有fieldDefs中查找
    if (typeof value === "string" && value.startsWith("opt") && allFieldDefs) {
      for (const fd of allFieldDefs) {
        if (fd.property?.options) {
          const option = fd.property.options.find((opt) => opt.id === value);
          if (option) return option.name;
        }
      }
    }
    return String(value);
  }

  const options = fieldDef.property?.options;
  if (!options) {
    // P1-RE-002修复：如果fieldDef存在但没有options，尝试从所有fieldDefs中查找
    if (allFieldDefs) {
      for (const fd of allFieldDefs) {
        if (fd.property?.options) {
          const option = fd.property.options.find((opt) => opt.id === value);
          if (option) return option.name;
        }
      }
    }
    // P1-RE-002-fix2: 从extraOptions中查找（用于Lookup字段）
    if (extraOptions) {
      const opt = extraOptions.find((o) => o.id === value);
      if (opt) return opt.name;
    }
    return String(value);
  }
  
  // 如果是数组（如 formula 返回的选项ID数组）
  if (Array.isArray(value)) {
    const names: string[] = [];
    for (const item of value) {
      if (typeof item === "string" && item.startsWith("opt")) {
        // 查找对应的选项名称
        const option = options.find((opt) => opt.id === item);
        if (option) {
          names.push(option.name);
        } else if (allFieldDefs) {
          // P1-RE-002修复：从所有fieldDefs中查找
          for (const fd of allFieldDefs) {
            if (fd.property?.options) {
              const opt = fd.property.options.find((o) => o.id === item);
              if (opt) {
                names.push(opt.name);
                break;
              }
            }
          }
        }
        // P1-RE-002-fix2: 从extraOptions中查找（用于Lookup字段）
        if (!names.some(n => n.startsWith('opt')) && extraOptions) {
          const opt = extraOptions.find((o) => o.id === item);
          if (opt) {
            names.push(opt.name);
          }
        }
      } else if (typeof item === "object" && item !== null && "text" in item) {
        // lookup 类型：{text: "xxx", record_ids: [...]}
        names.push(String((item as { text: string }).text));
      } else {
        names.push(String(item));
      }
    }
    return names.length > 0 ? names.join(", ") : String(value);
  }
  
  // 如果是单个字符串选项ID
  if (typeof value === "string" && value.startsWith("opt")) {
    const option = options.find((opt) => opt.id === value);
    if (option) return option.name;
    // P1-RE-002修复：从所有fieldDefs中查找
    if (allFieldDefs) {
      for (const fd of allFieldDefs) {
        if (fd.property?.options) {
          const opt = fd.property.options.find((o) => o.id === value);
          if (opt) return opt.name;
        }
      }
    }
    // P1-RE-002-fix2: 从extraOptions中查找（用于Lookup字段）
    if (extraOptions) {
      const opt = extraOptions.find((o) => o.id === value);
      if (opt) return opt.name;
    }
    return value;
  }
  
  return String(value);
}

/**
 * 空值显示映射
 */
function displayValue(value: unknown, emptyDisplay = "-", fieldDef?: FieldDef, allFieldDefs?: FieldDef[], extraOptions?: { id: string; name: string }[]): string {
  if (value === null || value === undefined || value === "") return emptyDisplay;
  
  // P1-005修复 + P1-RE-001修复：日期格式化（已在formatDate中处理）
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
    // P1-006修复 + P1-RE-002修复：处理公式/选项ID数组
    if (value.length > 0 && typeof value[0] === "string" && (value[0] as string).startsWith("opt")) {
      return mapOptionIdsToNames(value, fieldDef, allFieldDefs, extraOptions);
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
  onSearch,
  onCreate,
  onUpdate,
  pageSize = 20,
  emptyDisplay = "-",
  fieldDefs = [],
  extraOptions = [],
}: DataTableProps) {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Record<string, unknown> | null>(null);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [isCreate, setIsCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // 防抖处理搜索输入
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
      // 如果有 onSearch 回调，触发后端搜索
      if (onSearch) {
        onSearch(searchText);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, onSearch]);

  const handleClearSearch = () => {
    setSearchText("");
    if (onSearch) {
      onSearch("");
    }
  };

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
        <Box sx={{ display: "flex", alignItems: "center", width: 300, position: "relative" }}>
          <TextField
            size="small"
            placeholder="输入关键字搜索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            sx={{ width: "100%" }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: "action.active", mr: 1 }} />,
              endAdornment: searchText && (
                <IconButton size="small" onClick={handleClearSearch}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              ),
            }}
          />
          {debouncedSearch && (
            <Typography variant="caption" sx={{ position: "absolute", right: 8, bottom: -18, color: "text.secondary" }}>
              共 {total} 条记录
            </Typography>
          )}
        </Box>
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
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">{debouncedSearch ? "未找到匹配的记录" : "暂无数据"}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, idx) => {
                // P1-006修复 + P1-RE-002修复：获取当前行数据的字段定义
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
                              label={displayValue(row[col.field], emptyDisplay, fieldDef, fieldDefs, extraOptions)}
                              size="small"
                              variant="outlined"
                            />
                          ) : (
                            displayValue(row[col.field], emptyDisplay, fieldDef, fieldDefs, extraOptions)
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
