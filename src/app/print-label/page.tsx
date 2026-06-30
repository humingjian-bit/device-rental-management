"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  IconButton,
  Chip,
} from "@mui/material";
import {
  Search as SearchIcon,
  Print as PrintIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from "@mui/icons-material";
import Script from "next/script";
import { useCurrentStore, useStores } from "@/hooks/useStore";
import {
  connectService,
  getPrinters,
  connectPrinter,
  initSdkService,
  printLabel,
  buildDeviceLabel,
  isServiceConnected,
  type PrintProgress,
} from "@/services/printer";

type PrinterStatus = "connecting" | "ready" | "error";

interface DeviceRecord {
  record_id: string;
  SN编码?: string | string[];
  设备型号?: string | string[];
  [key: string]: unknown;
}

export default function PrintLabelPage() {
  const { storeId } = useCurrentStore();
  const { stores } = useStores();

  // 打印机状态
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>("connecting");
  const [printerName, setPrinterName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // 搜索
  const [searchValue, setSearchValue] = useState("");
  const [allDevices, setAllDevices] = useState<DeviceRecord[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // 打印状态
  const [printingSn, setPrintingSn] = useState<string | null>(null);
  const [lastPrintedSn, setLastPrintedSn] = useState<string | null>(null);

  const initAttempted = useRef(false);

  // 获取当前店铺名
  const currentStore = stores.find((s) => s.id === storeId);
  const storeName = currentStore?.name || storeId;

  // ============ 初始化打印机 ============
  const initPrinter = useCallback(async () => {
    if (!sdkLoaded) return;
    if (typeof getInstance !== "function") {
      setPrinterStatus("error");
      setErrorMsg("SDK 未加载，请刷新页面重试");
      return;
    }

    setPrinterStatus("connecting");
    setErrorMsg("");

    try {
      // Step 1: 连接打印服务
      await new Promise<void>((resolve, reject) => {
        connectService(
          () => resolve(),
          (err) => reject(new Error(err)),
          () => {} // disconnect 忽略
        );
        // 给 WebSocket 连接 3 秒超时
        setTimeout(() => reject(new Error("连接打印服务超时")), 3000);
      });

      // Step 2: 获取打印机列表
      const printers = await getPrinters();
      if (!printers || printers.length === 0) {
        throw new Error("未检测到 USB 打印机，请检查打印机连接");
      }
      const pName = printers[0].name;
      const pPort = printers[0].port;

      // Step 3: 连接打印机
      await connectPrinter(pName, parseInt(String(pPort)));
      setPrinterName(pName);

      // Step 4: 初始化 SDK
      await initSdkService();

      setPrinterStatus("ready");
    } catch (e: any) {
      setPrinterStatus("error");
      setErrorMsg(e.message || "初始化失败");
    }
  }, [sdkLoaded]);

  // SDK 加载完成后自动初始化
  useEffect(() => {
    if (sdkLoaded && !initAttempted.current) {
      initAttempted.current = true;
      initPrinter();
    }
  }, [sdkLoaded, initPrinter]);

  // ============ 搜索设备 ============
  const handleSearch = async () => {
    if (!searchValue.trim()) return;
    setLoading(true);
    setSearched(true);
    setFilteredDevices([]);

    try {
      // 获取全部设备数据（前端过滤）
      const allItems: DeviceRecord[] = [];
      let pageToken: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams({
          page_size: "100",
        });
        if (pageToken) params.set("page_token", pageToken);

        const res = await fetch(`/api/base/${storeId}/device?${params}`);
        const data = await res.json();

        if (data.items) {
          allItems.push(...data.items);
        }

        hasMore = data.has_more && !!data.page_token;
        pageToken = data.page_token;
      }

      setAllDevices(allItems);

      // 前端过滤：SN 包含搜索值
      const keyword = searchValue.trim().toLowerCase();
      const filtered = allItems.filter((item) => {
        const sn = extractFieldValue(item.SN编码);
        return sn && sn.toLowerCase().includes(keyword);
      });

      setFilteredDevices(filtered);
    } catch (e: any) {
      console.error("搜索失败:", e);
    } finally {
      setLoading(false);
    }
  };

  // ============ 打印 ============
  const handlePrint = async (device: DeviceRecord) => {
    const sn = extractFieldValue(device.SN编码);
    const model = extractFieldValue(device.设备型号);
    if (!sn) return;

    setPrintingSn(sn);
    setLastPrintedSn(null);

    try {
      const labelData = buildDeviceLabel(storeName, model || "未知型号", sn);
      await printLabel(labelData, {}, (progress: PrintProgress) => {
        if (progress.type === "done") {
          setLastPrintedSn(sn);
          setPrintingSn(null);
        } else if (progress.type === "error") {
          console.error("打印错误:", progress.msg);
          setPrintingSn(null);
        }
      });
    } catch (e: any) {
      console.error("打印失败:", e);
      setPrintingSn(null);
    }
  };

  // 回车搜索
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <>
      {/* 动态加载 SDK 脚本 */}
      <Script
        src="/js/api/jcPrinterSdk_api_third.js"
        strategy="afterInteractive"
        onReady={() => setSdkLoaded(true)}
        onError={() => {
          setPrinterStatus("error");
          setErrorMsg("SDK 加载失败");
        }}
      />

      <Box>
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          🏷️ 设备标签打印
        </Typography>

        {/* 状态栏 */}
        <Paper sx={{ p: 2, mb: 3, display: "flex", alignItems: "center", gap: 1.5 }}>
          {printerStatus === "connecting" && (
            <>
              <CircularProgress size={20} />
              <Typography color="primary">正在连接打印服务...</Typography>
            </>
          )}
          {printerStatus === "ready" && (
            <>
              <CheckCircleIcon color="success" />
              <Typography color="success.main">
                打印机已就绪：{printerName}
              </Typography>
            </>
          )}
          {printerStatus === "error" && (
            <>
              <ErrorIcon color="error" />
              <Typography color="error">{errorMsg}</Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => {
                  initAttempted.current = false;
                  initPrinter();
                }}
                sx={{ ml: 1 }}
              >
                重试
              </Button>
            </>
          )}
        </Paper>

        {/* 搜索区域 */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
            <TextField
              size="small"
              placeholder="输入 SN 编码搜索..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleKeyDown}
              sx={{ flexGrow: 1, maxWidth: 400 }}
              disabled={printerStatus !== "ready"}
            />
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              onClick={handleSearch}
              disabled={printerStatus !== "ready" || !searchValue.trim()}
            >
              搜索
            </Button>
          </Box>
        </Paper>

        {/* 搜索结果 */}
        {loading && (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <CircularProgress />
            <Typography sx={{ mt: 1 }}>搜索中...</Typography>
          </Box>
        )}

        {searched && !loading && (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>SN 编码</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>设备型号</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }} align="center">
                    操作
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        {searchValue ? "未找到匹配的设备" : "请输入 SN 编码搜索"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDevices.map((device, idx) => {
                    const sn = extractFieldValue(device.SN编码) || "-";
                    const model = extractFieldValue(device.设备型号) || "-";
                    const isPrinting = printingSn === sn;
                    const isLastPrinted = lastPrintedSn === sn;

                    return (
                      <TableRow key={device.record_id || idx} hover>
                        <TableCell>
                          <Typography fontFamily="monospace">{sn}</Typography>
                        </TableCell>
                        <TableCell>{model}</TableCell>
                        <TableCell align="center">
                          {isPrinting ? (
                            <CircularProgress size={20} />
                          ) : isLastPrinted ? (
                            <Chip
                              icon={<CheckCircleIcon />}
                              label="已打印"
                              color="success"
                              size="small"
                              variant="outlined"
                            />
                          ) : (
                            <IconButton
                              color="primary"
                              onClick={() => handlePrint(device)}
                              disabled={printerStatus !== "ready"}
                              title="打印标签"
                            >
                              <PrintIcon />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {searched && !loading && filteredDevices.length > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            共找到 {filteredDevices.length} 条匹配记录
          </Typography>
        )}
      </Box>
    </>
  );
}

/** 从字段值中提取字符串（兼容数组/字符串格式） */
function extractFieldValue(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? v : String(v))).join("");
  }
  return String(value);
}
