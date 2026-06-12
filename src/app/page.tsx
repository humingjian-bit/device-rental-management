"use client";

import { Box, Typography, Card, CardContent, Divider } from "@mui/material";
import Grid from "@mui/material/Unstable_Grid2";
import {
  Devices as DevicesIcon,
  Inventory as InventoryIcon,
  Description as OrderIcon,
  Build as RepairIcon,
  LocalShipping as ShipIcon,
  AssignmentReturn as ReturnIcon,
} from "@mui/icons-material";
import { useTableData } from "@/hooks/useTableData";
import { useCurrentStore } from "@/hooks/useStore";

export default function HomePage() {
  const { storeId } = useCurrentStore();

  const { items: orders, isLoading: ordersLoading } = useTableData(
    storeId,
    "order",
    { page_size: 100 }
  );
  const { total: deviceTotal, isLoading: deviceLoading } = useTableData(
    storeId,
    "device",
    { page_size: 1 }
  );
  const { total: inventoryTotal, isLoading: inventoryLoading } = useTableData(
    storeId,
    "inventory",
    { page_size: 1 }
  );
  const { total: repairTotal, isLoading: repairLoading } = useTableData(
    storeId,
    "repair",
    { page_size: 1 }
  );

  // P1-001修复：字段名改为与飞书表一致
  // - 租期开始 → 发货日期
  // - 租期结束 → 归还日期（预估）
  // - 订单状态 → 状态
  const today = new Date().toISOString().slice(0, 10);
  const todayShip = orders.filter((o) => {
    const start = String(o["发货日期"] || "");
    return start.startsWith(today);
  }).length;
  const todayReturn = orders.filter((o) => {
    const end = String(o["归还日期（预估）"] || "");
    return end.startsWith(today);
  }).length;
  const activeOrders = orders.filter((o) => {
    const status = o["状态"];
    const statusText =
      status && typeof status === "object" && "text" in (status as object)
        ? (status as { text: string }).text
        : String(status || "");
    return !statusText || statusText === "" || statusText === "进行中";
  }).length;

  const isLoading = ordersLoading || deviceLoading || inventoryLoading || repairLoading;

  const quickStats = [
    { label: "设备总数", icon: <DevicesIcon />, value: isLoading ? "..." : deviceTotal, color: "primary" as const },
    { label: "库存总量", icon: <InventoryIcon />, value: isLoading ? "..." : inventoryTotal, color: "info" as const },
    { label: "进行中订单", icon: <OrderIcon />, value: isLoading ? "..." : activeOrders, color: "warning" as const },
    { label: "维修中设备", icon: <RepairIcon />, value: isLoading ? "..." : repairTotal, color: "error" as const },
  ];

  const todayStats = [
    { label: "今日预计发货", icon: <ShipIcon sx={{ color: "success.main" }} />, value: isLoading ? "..." : todayShip },
    { label: "今日预计归还", icon: <ReturnIcon sx={{ color: "info.main" }} />, value: isLoading ? "..." : todayReturn },
  ];

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        首页概览
      </Typography>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        {quickStats.map((stat) => (
          <Grid key={stat.label} xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box sx={{ color: `${stat.color}.main` }}>{stat.icon}</Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    {stat.label}
                  </Typography>
                  <Typography variant="h5">{stat.value}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" fontWeight="bold" gutterBottom>
        今日运营指标
      </Typography>
      <Grid container spacing={2} sx={{ mt: 1 }}>
        {todayStats.map((stat) => (
          <Grid key={stat.label} xs={12} sm={6} md={3}>
            <Card variant="outlined" sx={{ borderColor: "primary.light" }}>
              <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                {stat.icon}
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    {stat.label}
                  </Typography>
                  <Typography variant="h5">{stat.value}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
