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
} from "@mui/material";
import {
  Edit as EditIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";

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
  onUpdate?: (recordId: string, fields: Record<string, unknown>) => Promise<void>;
  pageSize?: number;
  emptyDisplay?: string;
}

/**
 * 空值显示映射：空值 → "进行中"
 */
function displayValue(value: unknown, emptyDisplay = "-"): string {
  if (value === null || value === undefined || value === "") return emptyDisplay;
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : emptyDisplay;
  }
  if (typeof value === "object") {
    // 飞书 select 字段格式: { text: "xxx" }
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
}: DataTableProps) {
  const [searchText, setSearchText] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Record<string, unknown> | null>(null);
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [isCreate, setIsCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // 搜索过滤
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
          await onUpdate(recordId, editFields);
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
                <TableCell colSpan={columns.length + (onUpdate ? 1 : 0)} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={columns.length + (onUpdate ? 1 : 0)} align="center" sx={{ py: 4 }}>
                  <Typography color="error">加载失败，请重试</Typography>
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (onUpdate ? 1 : 0)} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">暂无数据</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row, idx) => (
                <TableRow key={String(row._record_id || idx)} hover>
                  {columns.map((col) => (
                    <TableCell key={col.field}>
                      {col.render ? (
                        col.render(row[col.field], row)
                      ) : col.type === "select" && row[col.field] ? (
                        <Chip
                          label={displayValue(row[col.field], emptyDisplay)}
                          size="small"
                          variant="outlined"
                        />
                      ) : (
                        displayValue(row[col.field], emptyDisplay)
                      )}
                    </TableCell>
                  ))}
                  {onUpdate && (
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => handleEdit(row)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 分页（简易版，使用 page_token） */}
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
                    <TextField
                      select
                      fullWidth
                      label={col.headerName}
                      value={editFields[col.field] || ""}
                      onChange={(e) => handleFieldChange(col.field, e.target.value)}
                      SelectProps={{ native: true }}
                      size="small"
                    >
                      <option value="">请选择</option>
                      {col.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </TextField>
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
