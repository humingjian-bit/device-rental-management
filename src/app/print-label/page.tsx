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
  Checkbox,
  LinearProgress,
  Alert,
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
  printBatchLabels,
  buildDeviceLabel,
  isServiceConnected,
  type PrintProgress,
} from "@/services/printer";

type PrinterStatus = "connecting" | "ready" | "error";

interface DeviceRecord {
  _record_id?: string;
  record_id?: string;
  SN编码?: string | string[];
  设备型号?: string | string[];
  [key: string]: unknown;
}

/** 安全获取记录的 record_id（兼容 _record_id 和 record_id 两种命名） */
function getRecordId(device: DeviceRecord, fallback: string | number): string {
  return device._record_id || device.record_id || String(fallback);
}

export default function PrintLabelPage() {
  const { storeId } = useCurrentStore();
  const { stores } = useStores();
  const currentStore = stores.find((s) => s.id === storeId);
  const storeName = currentStore?.name || storeId;

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

  // 多选
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 批量打印状态
  const [batchPrinting, setBatchPrinting] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  // 单张打印状态（兼容单条打印按钮）
  const [printingSn, setPrintingSn] = useState<string | null>(null);

  // 从设备管理页推送的设备
  const [pendingDevicesCount, setPendingDevicesCount] = useState(0);


  const initInProgress = useRef(false);

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
      await new Promise<void>((resolve, reject) => {
        connectService(
          () => resolve(),
          (err) => reject(new Error(err)),
          () => {}
        );
        setTimeout(() => reject(new Error("连接打印服务超时，请确认精臣打印服务已启动")), 5000);
      });

      await initSdkService();

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

      await connectPrinter(pName, parseInt(String(pPort)));
      setPrinterName(pName);
      setPrinterStatus("ready");
      initInProgress.current = false;
    } catch (e: any) {
      setPrinterStatus("error");
      setErrorMsg(e.message || "初始化失败");
      initInProgress.current = false;
    }
  }, []);

  // ============ 设备加载（单一入口）============
  // 从设备管理页跳转过来时，通过URL参数获取设备ID列表
  const deviceLoadInProgress = useRef(false);
  useEffect(() => {
    // 只有从设备页跳转过来（URL有from=device参数）才处理
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("from=device")) return;

    const idsParam = params.get("ids");
    if (!idsParam) return;
    const ids = idsParam.split(",").filter(Boolean);
    if (ids.length === 0) return;

    // 等待storeId就绪
    if (!storeId) return;

    // 防止重复加载
    if (deviceLoadInProgress.current) return;
    deviceLoadInProgress.current = true;

    console.log("[print-label] 从URL加载设备, ids=", ids, "storeId=", storeId);
    setLoading(true);

    fetch("/api/base/" + storeId + "/batch-records?table=device&ids=" + ids.map(id => encodeURIComponent(id)).join(","))
      .then(r => r.json())
      .then(data => {
        const items: DeviceRecord[] = data.items || [];
        console.log("[print-label] 批量获取设备返回", items.length, "条");
        if (items.length > 0) {
          setAllDevices(items);
          setFilteredDevices(items);
          setSearched(true);
          setSelectedIds(new Set(items.map((d, i) => getRecordId(d, i))));
          setPendingDevicesCount(items.length);
        }
      })
      .catch(e => {
        console.error("[print-label] 批量获取设备失败:", e);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [storeId]);

  // SDK脚本加载完成后初始化打印机
  useEffect(() => {
    initInProgress.current = false;
    setSdkLoaded(false);

    if (typeof getInstance === "function") {
      setSdkLoaded(true);
      initPrinter();
    }

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
    setSelectedIds(new Set()); // 搜索条件变化时清空已选

    try {
      const keyword = searchValue.trim();

      const params = new URLSearchParams({
        search_mode: "exact",
        search_field: "SN编码",
        search_value: keyword,
        page_size: "50",
      });

      const res = await fetch(`/api/base/${storeId}/device?${params}`);
      const data = await res.json();

      let items: DeviceRecord[] = data.items || [];

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

  // ============ 多选逻辑 ============
  const handleToggleSelect = (recordId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredDevices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDevices.map((d, i) => getRecordId(d, i))));
    }
  };

  const selectedDevices = filteredDevices.filter((d, i) => selectedIds.has(getRecordId(d, i)));
  const allSelected = filteredDevices.length > 0 && selectedIds.size === filteredDevices.length;

  // ============ 批量打印 ============
  const handleBatchPrint = async () => {
    if (selectedDevices.length === 0 || batchPrinting) return;

    setBatchPrinting(true);
    setBatchProgress({ current: 0, total: selectedDevices.length });

    const labels = selectedDevices.map(device => {
      const sn = extractFieldValue(device.SN编码);
      const model = extractFieldValue(device.设备型号);
      return buildDeviceLabel(storeName, model || "未知型号", sn || "UNKNOWN");
    });

    try {
      await printBatchLabels(labels, {}, (progress: PrintProgress) => {
        if (progress.type === "page_done") {
          setBatchProgress({ current: progress.currentPage || 0, total: progress.totalPages || 0 });
        } else if (progress.type === "done") {
          setBatchPrinting(false);
          setSelectedIds(new Set());
        } else if (progress.type === "error") {
          console.error("[BatchPrint] 错误:", progress.msg);
          // 单页错误不中止，继续打印
        }
      });
    } catch (e: any) {
      console.error("批量打印失败:", e);
      setBatchPrinting(false);
    }
  };

  // ============ 单张打印（兼容） ============
  const handlePrintSingle = async (device: DeviceRecord) => {
    const sn = extractFieldValue(device.SN编码);
    const model = extractFieldValue(device.设备型号);
    if (!sn || batchPrinting) return;

    setPrintingSn(sn);

    try {
      const labelData = buildDeviceLabel(storeName, model || "未知型号", sn);
      await printBatchLabels([labelData], {}, (progress: PrintProgress) => {
        if (progress.type === "done") {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const isLocked = batchPrinting;

  return (
    <>
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

        {/* 设备管理推送提示 */}
        {pendingDevicesCount > 0 && (
          <Alert severity="info" sx={{ mb: 2 }} onClose={() => setPendingDevicesCount(0)}>
            已从设备管理接收 {pendingDevicesCount} 台设备，全部默认勾选
          </Alert>
        )}

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
              disabled={printerStatus !== "ready" || isLocked}
            />
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              onClick={handleSearch}
              disabled={printerStatus !== "ready" || !searchValue.trim() || isLocked}
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
          <>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={selectedIds.size > 0 && selectedIds.size < filteredDevices.length}
                        onChange={handleSelectAll}
                        disabled={isLocked}
                      />
                    </TableCell>
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
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          {searchValue ? "未找到匹配的设备" : "请输入 SN 编码搜索"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDevices.map((device, idx) => {
                      const id = getRecordId(device, idx);
                      const sn = extractFieldValue(device.SN编码) || "-";
                      const model = extractFieldValue(device.设备型号) || "-";
                      const isSelected = selectedIds.has(id);
                      const isPrinting = printingSn === sn;

                      return (
                        <TableRow
                          key={id}
                          hover
                          selected={isSelected}
                          sx={{ cursor: "pointer" }}
                          onClick={() => !isLocked && handleToggleSelect(id)}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={isSelected}
                              disabled={isLocked}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => handleToggleSelect(id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography fontFamily="monospace">{sn}</Typography>
                          </TableCell>
                          <TableCell>{model}</TableCell>
                          <TableCell align="center">
                            {isPrinting ? (
                              <CircularProgress size={20} />
                            ) : (
                              <IconButton
                                color="primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePrintSingle(device);
                                }}
                                disabled={printerStatus !== "ready" || isLocked}
                                title="打印此标签"
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

            {/* 底部操作栏 */}
            <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={batchPrinting ? <CircularProgress size={20} color="inherit" /> : <PrintIcon />}
                onClick={handleBatchPrint}
                disabled={selectedDevices.length === 0 || isLocked || printerStatus !== "ready"}
                sx={{ minWidth: 200 }}
              >
                {batchPrinting
                  ? `打印中 ${batchProgress.current}/${batchProgress.total}...`
                  : `🖨 批量打印选中 (${selectedDevices.length})`}
              </Button>

              {batchPrinting && (
                <Box sx={{ flexGrow: 1, maxWidth: 300 }}>
                  <LinearProgress
                    variant="determinate"
                    value={batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>
              )}

              <Typography variant="body2" color="text.secondary">
                共 {filteredDevices.length} 条记录{selectedIds.size > 0 && `，已选 ${selectedIds.size} 项`}
              </Typography>
            </Box>
          </>
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
