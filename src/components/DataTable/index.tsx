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
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
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
  nextPageToken?: string;
  hasMore: boolean;
  onPageChange: (pageToken?: string) => void;
  onRefresh: () => void;
  onSearch?: (keyword: string) => void;  // 模糊搜索回调
  onAdvancedSearch?: (field: string, value: string) => void;  // 高级搜索回调（精确匹配）
  onClearAdvancedSearch?: () => void;  // 清除高级搜索回调
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
  nextPageToken,
  onPageChange,
  onRefresh,
  onSearch,
  onAdvancedSearch,
  onClearAdvancedSearch,
  onCreate,
  onUpdate,
  pageSize = 20,
  emptyDisplay = "-",
  fieldDefs = [],
  extraOptions = [],
}: DataTableProps) {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);  // 高级搜索展开状态
  const [advancedField, setAdvancedField] = useState("");  // 高级搜索字段
  const [advancedValue, setAdvancedValue] = useState("");  // 高级搜索值
  const [pageTokens, setPageTokens] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [jumpPage, setJumpPage] = useState("");
  const [jumpTargetPage, setJumpTargetPage] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Record<string, unknown> | null>(null);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [isCreate, setIsCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // 重置分页状态（搜索时调用）
  const resetPagination = useCallback(() => {
    setCurrentPage(0);
    setPageTokens([]);
    setJumpTargetPage(null);
  }, []);

  // 防抖处理搜索输入
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
      // 如果有 onSearch 回调，触发后端搜索
      if (onSearch) {
        onSearch(searchText);
        resetPagination();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, onSearch, resetPagination]);

  const handleClearSearch = () => {
    setSearchText("");
    if (onSearch) {
      onSearch("");
      resetPagination();
    }
  };

  // 高级搜索 - 使用 useCallback 保持稳定引用
  const handleAdvancedSearch = useCallback(() => {
    const field = advancedField;
    const value = advancedValue;
    if (onAdvancedSearch && field && value) {
      // 先清空模糊搜索状态
      setSearchText("");
      setDebouncedSearch("");
      resetPagination();
      // 直接调用 onAdvancedSearch，不经过防抖
      onAdvancedSearch(field, value);
    }
  }, [advancedField, advancedValue, onAdvancedSearch, resetPagination]);

  // 暴露重置高级搜索的方法给父组件使用
  const resetAdvancedSearch = useCallback(() => {
    setAdvancedField("");
    setAdvancedValue("");
    setAdvancedSearchOpen(false);
  }, []);

  const handleClearAdvancedSearch = () => {
    setAdvancedField("");
    setAdvancedValue("");
    resetPagination();
    // 通知父组件清除高级搜索状态
    if (onClearAdvancedSearch) {
      onClearAdvancedSearch();
    }
    // 刷新数据（不带高级搜索条件）
    onRefresh();
  };

  // 首页
  const handleFirstPage = () => {
    setCurrentPage(0);
    setPageTokens([]);
    onPageChange(undefined);
  };

  // 上一页
  const handlePrevPage = () => {
    if (currentPage > 0) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      onPageChange(pageTokens[newPage]);
    }
  };

  // 下一页
  const handleNextPage = () => {
    if (hasMore && nextPageToken) {
      const newPage = currentPage + 1;
      // 保存当前页的 nextPageToken，用于后续返回该页
      const newTokens = [...pageTokens];
      newTokens[newPage] = nextPageToken;
      setPageTokens(newTokens);
      setCurrentPage(newPage);
      // 触发加载下一页
      onPageChange(nextPageToken);
    }
  };

  // 跳转到指定页
  const handleJumpToPage = () => {
    const target = parseInt(jumpPage, 10);
    if (isNaN(target) || target < 1) return;
    if (target === 1) {
      handleFirstPage();
      setJumpPage("");
      return;
    }
    if (target > 1 && target <= pageTokens.length) {
      // 已加载过该页的token，直接跳转
      const token = pageTokens[target - 1];
      setCurrentPage(target - 1);
      onPageChange(token);
      setJumpPage("");
      return;
    }
    // 需要逐页加载到目标页，启动自动加载
    setJumpTargetPage(target);
    setJumpPage("");
  };

  // 逐页自动加载到目标页（游标分页无法直接跳转，需依次获取token）
  useEffect(() => {
    if (jumpTargetPage === null) return;
    if (isLoading) return; // 等待当前请求完成

    const targetPageIndex = jumpTargetPage - 1;

    if (currentPage === targetPageIndex) {
      // 已到达目标页
      setJumpTargetPage(null);
      return;
    }

    if (currentPage < targetPageIndex && hasMore && nextPageToken) {
      // 继续向前加载下一页
      const newTokens = [...pageTokens];
      newTokens[currentPage + 1] = nextPageToken;
      setPageTokens(newTokens);
      setCurrentPage(currentPage + 1);
      onPageChange(nextPageToken);
    } else {
      // 无法继续（没有更多页或没有token）
      setJumpTargetPage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTargetPage, currentPage, hasMore, nextPageToken, isLoading]);

  // 获取可搜索的字段列表（从columns中提取）
  const searchableFields = columns.map(col => ({ display: col.headerName, value: col.field }));

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
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {/* 模糊搜索行 */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TextField
              size="small"
              placeholder="搜索 SN/设备/分类..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              sx={{ width: 250 }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: "action.active", mr: 1 }} />,
                endAdornment: searchText && (
                  <IconButton size="small" onClick={handleClearSearch}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                ),
              }}
            />
            <Button
              size="small"
              variant="text"
              endIcon={advancedSearchOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setAdvancedSearchOpen(!advancedSearchOpen)}
              sx={{ color: "text.secondary" }}
            >
              高级
            </Button>
          </Box>
          {/* 高级搜索面板（可折叠） */}
          {advancedSearchOpen && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>字段</InputLabel>
                <Select
                  value={advancedField}
                  label="字段"
                  onChange={(e) => setAdvancedField(e.target.value)}
                >
                  {searchableFields.map((item) => (
                    <MenuItem key={item.value} value={item.value}>{item.display}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="精确值"
                value={advancedValue}
                onChange={(e) => setAdvancedValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && advancedField && advancedValue) {
                    handleAdvancedSearch();
                  }
                }}
                sx={{ width: 180 }}
              />
              <Button
                size="small"
                variant="contained"
                onClick={handleAdvancedSearch}
                disabled={!advancedField || !advancedValue}
              >
                搜索
              </Button>
              {(advancedField || advancedValue) && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleClearAdvancedSearch}
                >
                  清除
                </Button>
              )}
            </Box>
          )}
          {/* 搜索结果提示 */}
          {(debouncedSearch || advancedField || advancedValue) && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {advancedField && advancedValue
                ? `高级搜索 [${advancedField} = "${advancedValue}"]，共 ${total} 条`
                : `共 ${total} 条记录`}
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
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {total > 0 ? `第 ${currentPage * pageSize + 1}-${currentPage * pageSize + rows.length} 条，共 ${total} 条` : `共 0 条`}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" onClick={handleFirstPage} disabled={currentPage === 0}>
            <FirstPageIcon />
          </IconButton>
          <IconButton size="small" onClick={handlePrevPage} disabled={currentPage === 0}>
            <PrevIcon />
          </IconButton>
          <Typography variant="body2" sx={{ mx: 0.5 }}>
            第 {currentPage + 1} 页
          </Typography>
          <TextField
            size="small"
            placeholder="跳转"
            value={jumpPage}
            onChange={(e) => setJumpPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleJumpToPage();
              }
            }}
            sx={{ width: 60, mx: 0.5 }}
            inputProps={{ style: { padding: "4px 8px", textAlign: "center" } }}
          />
          <Button size="small" variant="text" onClick={handleJumpToPage} sx={{ minWidth: 0, px: 1 }}>
            跳转
          </Button>
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
