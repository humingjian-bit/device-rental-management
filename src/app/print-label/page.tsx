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
  CircularProgress,
  IconButton,
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
  disconnectService,
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
  const [cooldownSn, setCooldownSn] = useState<string | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initInProgress = useRef(false);

  // 获取当前店铺名
  const currentStore = stores.find((s) => s.id === storeId);
  const storeName = currentStore?.name || storeId;

  // ============ 初始化打印机 ============
  const initPrinter = useCallback(async () => {
    if (initInProgress.current) return;
    initInProgress.current = true;

    if (typeof getInstance !== "function") {
      setPrinterStatus("error");
      setErrorMsg("SDK 未加载，请刷新页面重试");
      initInProgress.current = false;
      return;
    }

    setPrinterStatus("connecting");
    setErrorMsg("");

    try {
      // 先断开旧的 WebSocket 连接（页面切换后可能已失效）
      disconnectService();
      await new Promise(r => setTimeout(r, 500));

      // Step 1: 连接打印服务（创建全新 WebSocket 连接）
      await new Promise<void>((resolve, reject) => {
        connectService(
          () => resolve(),
          (err) => reject(new Error(err)),
          () => {}
        );
        setTimeout(() => reject(new Error("连接打印服务超时，请确认精臣打印服务已启动")), 5000);
      });

      // Step 2: 获取打印机列表（重试 3 次，SDK 重新连接后可能需要时间枚举设备）
      let printers: { name: string; port: number }[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        printers = await getPrinters();
        if (printers && printers.length > 0) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      if (!printers || printers.length === 0) {
        throw new Error("未检测到打印机，请检查 USB 连接后重试");
      }
      const pName = printers[0].name;
      const pPort = printers[0].port;

      // Step 3: 连接打印机
      await connectPrinter(pName, parseInt(String(pPort)));
      setPrinterName(pName);

      // Step 4: 初始化 SDK
      await initSdkService();

      setPrinterStatus("ready");
      initInProgress.current = false;
    } catch (e: any) {
      setPrinterStatus("error");
      setErrorMsg(e.message || "初始化失败");
      initInProgress.current = false;
    }
  }, []);

  // 组件挂载时：检查 SDK 是否已加载（处理页面切换回来的场景）
  useEffect(() => {
    // 重置状态，确保即使 ref 跨 mount 持久化也能重新初始化
    initInProgress.current = false;
    setSdkLoaded(false);

    if (typeof getInstance === "function") {
      setSdkLoaded(true);
      initPrinter();
    }

    // visibilitychange: 切回页面时自动检测并重连
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && typeof getInstance === "function") {
        initPrinter();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      initInProgress.current = false;
      setSdkLoaded(false);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [initPrinter]);

  // SDK Script 首次加载完成时触发
  const handleScriptReady = () => {
    setSdkLoaded(true);
    if (!initInProgress.current) {
      initPrinter();
    }
  };

  // ============ 搜索设备 ============
  const handleSearch = async () => {
    if (!searchValue.trim()) return;
    setLoading(true);
    setSearched(true);
    setFilteredDevices([]);

    try {
      const keyword = searchValue.trim();

      // 优先用飞书 search API（contains 子串匹配，速度快）
      const params = new URLSearchParams({
        search_mode: "exact",
        search_field: "SN编码",
        search_value: keyword,
        page_size: "50",
      });

      const res = await fetch(`/api/base/${storeId}/device?${params}`);
      const data = await res.json();

      let items: DeviceRecord[] = data.items || [];

      // 如果 search API 返回空结果，回退到模糊搜索（前端过滤）
      if (items.length === 0) {
        const fuzzyParams = new URLSearchParams({
          search: keyword,
          page_size: "50",
        });
        const fuzzyRes = await fetch(`/api/base/${storeId}/device?${fuzzyParams}`);
        const fuzzyData = await fuzzyRes.json();
        items = fuzzyData.items || [];
      }

      setAllDevices(items);
      setFilteredDevices(items);
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
    setCooldownSn(null);
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);

    try {
      const labelData = buildDeviceLabel(storeName, model || "未知型号", sn);
      await printLabel(labelData, {}, (progress: PrintProgress) => {
        if (progress.type === "done") {
          setPrintingSn(null);
          // 3 秒冷却后才允许再次打印
          setCooldownSn(sn);
          cooldownTimer.current = setTimeout(() => {
            setCooldownSn(null);
          }, 3000);
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
        onReady={handleScriptReady}
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
                onClick={() => { initInProgress.current = false; initPrinter(); }}
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
                    const isCoolingDown = cooldownSn === sn;

                    return (
                      <TableRow key={device.record_id || idx} hover>
                        <TableCell>
                          <Typography fontFamily="monospace">{sn}</Typography>
                        </TableCell>
                        <TableCell>{model}</TableCell>
                        <TableCell align="center">
                          {isPrinting ? (
                            <CircularProgress size={20} />
                          ) : (
                            <IconButton
                              color={isCoolingDown ? "default" : "primary"}
                              onClick={() => !isCoolingDown && handlePrint(device)}
                              disabled={printerStatus !== "ready" || isCoolingDown}
                              title={isCoolingDown ? "3秒后可重新打印" : "打印标签"}
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
