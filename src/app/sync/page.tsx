"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  TextField,
  InputAdornment,
  Paper,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import {
  Upload as UploadIcon,
  PlayArrow as PlayIcon,
  Description as FileIcon,
  Lock as LockIcon,
} from "@mui/icons-material";
import { useCurrentStore } from "@/hooks/useStore";
import { PlatformConfig } from "@/lib/config";

interface Platform {
  id: string;
  name: string;
  enabled: boolean;
  file_type: string;
}

interface LogEntry {
  level: "INFO" | "WARNING" | "ERROR";
  message: string;
  timestamp: string;
}

interface SyncResult {
  success: boolean;
  stats: {
    created: number;
    updated: number;
    skipped: number;
    skipped_reasons: string[];
    inventory_updated: number;
    inventory_failed: number;
    errors: string[];
  };
  logs: LogEntry[];
}

export default function SyncPage() {
  const { storeId } = useCurrentStore();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 滚动到日志底部
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // 加载平台配置
  useEffect(() => {
    fetchPlatforms();
  }, [storeId]);

  async function fetchPlatforms() {
    try {
      const res = await fetch("/api/config/stores");
      const data = await res.json();
      const store = data.stores?.find((s: { id: string }) => s.id === storeId);
      if (store?.platforms) {
        setPlatforms(store.platforms);
        // 默认选中第一个启用的平台
        const firstEnabled = store.platforms.find((p: Platform) => p.enabled);
        if (firstEnabled) {
          setSelectedPlatform(firstEnabled.id);
        }
      }
    } catch (e) {
      console.error("加载平台配置失败:", e);
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
  }

  async function handleSync() {
    if (!selectedPlatform || !selectedFile) {
      setError("请选择平台和文件");
      return;
    }

    const platform = platforms.find((p) => p.id === selectedPlatform);
    if (!platform?.enabled) {
      setError(`平台"${platform?.name}"尚未启用`);
      return;
    }

    setIsSyncing(true);
    setLogs([]);
    setResult(null);
    setError(null);

    // 添加开始日志
    const startLog: LogEntry = {
      level: "INFO",
      message: `开始同步 ${platform.name}...`,
      timestamp: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
    };
    setLogs([startLog]);

    try {
      const formData = new FormData();
      formData.append("store", storeId);
      formData.append("platform", selectedPlatform);
      formData.append("file", selectedFile);

      const res = await fetch("/api/actions/sync-orders", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setResult(data);

      // 显示所有日志
      if (data.logs) {
        setLogs(data.logs);
      }

      if (!data.success) {
        setError(data.error || "同步失败");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`同步失败: ${message}`);
      setLogs((prev) => [
        ...prev,
        {
          level: "ERROR",
          message: `同步失败: ${message}`,
          timestamp: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
        },
      ]);
    } finally {
      setIsSyncing(false);
    }
  }

  function getLogColor(level: string) {
    switch (level) {
      case "INFO":
        return "inherit";
      case "WARNING":
        return "#f59e0b";
      case "ERROR":
        return "#ef4444";
      default:
        return "inherit";
    }
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        更新订单
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        选择平台和订单文件，同步订单数据到飞书多维表
      </Typography>

      <Grid container spacing={3}>
        {/* 平台选择区 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                选择平台
              </Typography>
              <Grid container spacing={2}>
                {platforms.map((platform) => (
                  <Grid item xs={12} sm={6} md={4} key={platform.id}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        cursor: !platform.enabled ? "not-allowed" : "pointer",
                        opacity: platform.enabled ? 1 : 0.5,
                        borderColor:
                          selectedPlatform === platform.id ? "primary.main" : undefined,
                        bgcolor:
                          selectedPlatform === platform.id ? "action.selected" : undefined,
                      }}
                      onClick={() => {
                        if (platform.enabled) {
                          setSelectedPlatform(platform.id);
                          setError(null);
                        }
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="subtitle1">
                          {platform.name}
                          {!platform.enabled && (
                            <LockIcon
                              fontSize="small"
                              sx={{ ml: 0.5, verticalAlign: "middle", color: "text.secondary" }}
                            />
                          )}
                        </Typography>
                        {selectedPlatform === platform.id && (
                          <Chip label="已选择" size="small" color="primary" />
                        )}
                      </Box>
                      {platform.enabled && (
                        <Typography variant="caption" color="text.secondary">
                          支持文件格式: {platform.file_type.toUpperCase()}
                        </Typography>
                      )}
                      {!platform.enabled && (
                        <Typography variant="caption" color="text.secondary">
                          该平台尚未配置
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* 文件选择区 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                选择文件
              </Typography>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept={
                  selectedPlatform
                    ? platforms.find((p) => p.id === selectedPlatform)?.file_type === "csv"
                      ? ".csv"
                      : ".xlsx,.xls"
                    : ".csv,.xlsx,.xls"
                }
                onChange={handleFileSelect}
              />
              <Paper
                variant="outlined"
                sx={{
                  p: 4,
                  textAlign: "center",
                  cursor: "pointer",
                  borderStyle: "dashed",
                  "&:hover": { bgcolor: "action.hover" },
                }}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                {selectedFile ? (
                  <Box>
                    <FileIcon sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
                    <Typography variant="subtitle1">{selectedFile.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Button size="small" variant="outlined" onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}>
                        重新选择
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Box>
                    <UploadIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
                    <Typography variant="subtitle1">点击选择文件或拖拽到此处</Typography>
                    <Typography variant="caption" color="text.secondary">
                      支持 CSV、XLSX、XLS 格式
                    </Typography>
                  </Box>
                )}
              </Paper>
            </CardContent>
          </Card>
        </Grid>

        {/* 操作按钮 */}
        <Grid item xs={12}>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={isSyncing ? <CircularProgress size={20} color="inherit" /> : <PlayIcon />}
              disabled={!selectedPlatform || !selectedFile || isSyncing}
              onClick={handleSync}
            >
              {isSyncing ? "同步中..." : "开始同步"}
            </Button>
          </Box>
        </Grid>

        {/* 错误提示 */}
        {error && (
          <Grid item xs={12}>
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          </Grid>
        )}

        {/* 同步结果 */}
        {result && result.success && (
          <Grid item xs={12}>
            <Card sx={{ bgcolor: "#f0fdf4" }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  同步完成 ✅
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">
                      新增
                    </Typography>
                    <Typography variant="h4" color="success.main">
                      {result.stats.created}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">
                      更新
                    </Typography>
                    <Typography variant="h4" color="primary.main">
                      {result.stats.updated}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">
                      跳过
                    </Typography>
                    <Typography variant="h4" color="warning.main">
                      {result.stats.skipped}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="body2" color="text.secondary">
                      库存更新
                    </Typography>
                    <Typography variant="h4" color="info.main">
                      {result.stats.inventory_updated}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* 日志区 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                日志
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  maxHeight: 400,
                  maxWidth: 1600,
                  width: "100%",
                  overflow: "auto",
                  fontFamily: "monospace",
                  fontSize: 13,
                  bgcolor: "#1e1e1e",
                  color: "#d4d4d4",
                  wordBreak: "break-all",
                  overflowWrap: "break-word",
                  boxSizing: "border-box",
                }}
              >
                {logs.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    暂无日志
                  </Typography>
                ) : (
                  logs.map((log, index) => (
                    <Box
                      key={index}
                      sx={{
                        py: 0.75,
                        px: 1,
                        color: getLogColor(log.level),
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        "&:hover": { bgcolor: "rgba(255,255,255,0.05)" },
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{ fontFamily: "monospace", fontSize: "0.82rem", lineHeight: 1.6, wordBreak: "break-all", overflowWrap: "break-word", display: "block" }}
                      >
                        [{log.timestamp}] {log.message}
                      </Typography>
                    </Box>
                  ))
                )}
                <div ref={logsEndRef} />
              </Paper>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
