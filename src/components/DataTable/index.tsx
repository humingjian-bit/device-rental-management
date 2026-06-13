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
  InputAdornment,
} from "@mui/material";
import {
  Edit as EditIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  FirstPage as FirstPageIcon,
  LastPage as LastPageIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
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
  fieldDefs?: FieldDef[];
  extraOptions?: { id: string; name: string }[];
  // Phase 3: 搜索功能
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

function formatDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    if (value.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }
    return null;
  }
  
  if (typeof value === "number" && value > 1000000000000) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  
  return null;
}

function mapOptionIdsToNames(value: unknown, fieldDef?: FieldDef, allFieldDefs?: FieldDef[], extraOptions?: { id: string; name: string }[]): string {
  if (!fieldDef) {
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
    if (allFieldDefs) {
      for (const fd of allFieldDefs) {
        if (fd.property?.options) {
          const option = fd.property.options.find((opt) => opt.id === value);
          if (option) return option.name;
        }
      }
    }
    if (extraOptions) {
      const opt = extraOptions.find((o) => o.id === value);
      if (opt) return opt.name;
    }
    return String(value);
  }
  
  if (Array.isArray(value)) {
    const names: string[] = [];
    for (const item of value) {
      if (typeof item === "string" && item.startsWith("opt")) {
        const option = options.find((opt) => opt.id === item);
        if (option) {
          names.push(option.name);
        } else if (allFieldDefs) {
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
        if (!names.some(n => n.startsWith('opt')) && extraOptions) {
          const opt = extraOptions.find((o) => o.id === item);
          if (opt) names.push(opt.name);
        }
      } else if (typeof item === "object" && item !== null && "text" in item) {
        names.push(String((item as { text: string }).text));
      } else {
        names.push(String(item));
      }
    }
    return names.length > 0 ? names.join(", ") : String(value);
  }
  
  if (typeof value === "string" && value.startsWith("opt")) {
    const option = options.find((opt) => opt.id === value);
    if (option) return option.name;
    if (allFieldDefs) {
      for (const fd of allFieldDefs) {
        if (fd.property?.options) {
          const opt = fd.property.options.find((o) => o.id === value);
          if (opt) return opt.name;
        }
      }
    }
    if (extraOptions) {
      const opt = extraOptions.find((o) => o.id === value);
      if (opt) return opt.name;
    }
    return value;
  }
  
  return String(value);
}

function displayValue(value: unknown, emptyDisplay = "-", fieldDef?: FieldDef, allFieldDefs?: FieldDef[], extraOptions?: { id: string; name: string }[]): string {
  if (value === null || value === undefined || value === "") return emptyDisplay;
  
  const formattedDate = formatDate(value);
  if (formattedDate) return formattedDate;
  
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "object" && "text" in (value[0] as object)) {
      const texts = value.map((item) => {
        if (typeof item === "object" && item !== null && "text" in item) {
          return String((item as { text: string }).text);
        }
        return String(item);
      });
      return texts.join(", ");
    }
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
  extraOptions = [],
  searchValue = "",
  onSearchChange,
}: DataTableProps) {
  const [searchText, setSearchText] = useState(searchValue);
  const [pageTokens, setPageTokens] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Record<string, unknown> | null>(null);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [isCreate, setIsCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // 同步外部searchValue
  useEffect(() => {
    setSearchText(searchValue);
  }, [searchValue]);

  // 当pageToken变化时（重新加载），重置分页状态
  useEffect(() => {
    if (!isLoading && rows.length > 0) {
      // 成功加载了新数据
    }
  }, [isLoading, rows.length]);

  const handleSearch = () => {
    if (onSearchChange) {
      onSearchChange(searchText);
    }
    setCurrentPage(0);
    setPageTokens([]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleClearSearch = () => {
    setSearchText("");
    if (onSearchChange) {
      onSearchChange("");
    }
    setCurrentPage(0);
    setPageTokens([]);
  };

  const handleFirstPage = () => {
    setCurrentPage(0);
    setPageTokens([]);
    onPageChange(undefined);
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      onPageChange(pageTokens[newPage]);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      // 保存当前页的token用于返回
      if (pageTokens.length < newPage + 1) {
        setPageTokens([...pageTokens, pageTokens[pageTokens.length - 1] || pageTokens[0] || ""]);
      }
      // 触发加载下一页
      onPageChange(pageTokens[pageTokens.length - 1]);
    }
  };

  // 过滤（仅前端本地搜索）
  const filteredRows = searchText && !onSearchChange
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
  const startItem = currentPage * pageSize + 1;
  const endItem = Math.min(startItem + rows.length - 1, total);

  return (
    <Box>
      {/* 工具栏 */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <TextField
          size="small"
          placeholder="搜索（SN:xxx / 型号:xxx / 平台:xxx / 状态:xxx）"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyPress={handleKeyPress}
          sx={{ width: 400 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searchText && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClearSearch}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
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

      {/* Phase 3: 分页升级 - 总数 + 页码导航 */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {total > 0 ? `第 ${startItem}-${endItem} 条，共 ${total} 条` : `共 ${total} 条`}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" onClick={handleFirstPage} disabled={currentPage === 0}>
            <FirstPageIcon />
          </IconButton>
          <IconButton size="small" onClick={handlePrevPage} disabled={currentPage === 0}>
            <PrevIcon />
          </IconButton>
          <Typography variant="body2" sx={{ mx: 1 }}>
            第 {currentPage + 1} 页
          </Typography>
          <IconButton size="small" onClick={handleNextPage} disabled={!hasMore}>
            <NextIcon />
          </IconButton>
          <IconButton size="small" disabled>
            <LastPageIcon />
          </IconButton>
        </Box>
      </Box>

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
