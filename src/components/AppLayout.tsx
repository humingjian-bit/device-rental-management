"use client";

import React, { useState } from "react";
import {
  Select,
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  AppBar,
  Toolbar,
  Avatar,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Collapse,
} from "@mui/material";
import {
  Home as HomeIcon,
  Devices as DevicesIcon,
  Inventory as InventoryIcon,
  Description as OrderIcon,
  Build as RepairIcon,
  Sync as SyncIcon,
  Store as StoreIcon,
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Logout as LogoutIcon,
} from "@mui/icons-material";
import { useRouter, usePathname } from "next/navigation";
import { useCurrentStore, useStores, useAuth } from "@/hooks/useStore";

const DRAWER_WIDTH = 220;
const COLLAPSED_WIDTH = 64;

const menuItems = [
  { key: "/", icon: <HomeIcon />, label: "首页" },
  { key: "/device", icon: <DevicesIcon />, label: "设备管理" },
  { key: "/inventory", icon: <InventoryIcon />, label: "库存管理" },
  { key: "/order", icon: <OrderIcon />, label: "订单管理" },
  { key: "/repair", icon: <RepairIcon />, label: "维修管理" },
  { key: "/sync", icon: <SyncIcon />, label: "更新订单" },
];

const theme = createTheme({
  palette: {
    primary: { main: "#1976d2" },
    background: { default: "#f5f5f5" },
  },
  typography: { fontSize: 14 },
});

interface MenuItemProps {
  item: { key: string; icon: React.ReactNode; label: string };
  collapsed: boolean;
  selected: boolean;
  onClick: () => void;
}

function CollapsibleMenuItem({ item, collapsed, selected, onClick }: MenuItemProps) {
  const button = (
    <ListItemButton
      selected={selected}
      onClick={onClick}
      sx={{
        minHeight: 48,
        justifyContent: collapsed ? "center" : "flex-start",
        px: 2.5,
        borderRadius: 1,
        mx: 1,
        "&.Mui-selected": {
          bgcolor: "primary.main",
          color: "white",
          "& .MuiListItemIcon-root": { color: "white" },
          "&:hover": { bgcolor: "primary.dark" },
        },
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 0,
          mr: collapsed ? 0 : 2,
          justifyContent: "center",
          color: selected ? "white" : "inherit",
        }}
      >
        {item.icon}
      </ListItemIcon>
      <Collapse in={!collapsed} orientation="horizontal" timeout="auto" unmountOnExit>
        <ListItemText primary={item.label} />
      </Collapse>
    </ListItemButton>
  );

  return collapsed ? (
    <Tooltip title={item.label} placement="right" arrow>
      {button}
    </Tooltip>
  ) : (
    button
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { storeId, switchStore } = useCurrentStore();
  const { stores } = useStores();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const drawerWidth = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  const drawerContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Logo区域 */}
      <Box
        sx={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          borderBottom: "1px solid #e0e0e0",
          px: collapsed ? 0 : 1.5,
          overflow: "hidden",
        }}
      >
        {!collapsed && (
          <>
            <StoreIcon sx={{ mr: 1, color: "primary.main", flexShrink: 0 }} />
            <Typography
              variant="subtitle1"
              fontWeight="bold"
              sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              设备租赁管理
            </Typography>
          </>
        )}
        {collapsed && <StoreIcon sx={{ color: "primary.main" }} />}
        {!collapsed && (
          <IconButton size="small" onClick={() => setCollapsed(true)} sx={{ ml: 0.5 }}>
            <ChevronLeftIcon />
          </IconButton>
        )}
      </Box>

      {/* 菜单列表 */}
      <List sx={{ flexGrow: 1, pt: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.key} disablePadding sx={{ mb: 0.5 }}>
            <CollapsibleMenuItem
              item={item}
              collapsed={collapsed}
              selected={pathname === item.key}
              onClick={() => router.push(item.key)}
            />
          </ListItem>
        ))}
      </List>

      {/* 展开按钮 */}
      {collapsed && (
        <Box sx={{ p: 1, borderTop: "1px solid #e0e0e0", display: "flex", justifyContent: "center" }}>
          <Tooltip title="展开菜单" placement="right">
            <IconButton size="small" onClick={() => setCollapsed(false)}>
              <ChevronRightIcon />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );

  const isTestEnv = typeof window !== "undefined" && window.location.port === "3000";

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* 测试环境横幅 */}
      {isTestEnv && (
        <Box
          sx={{
            bgcolor: "#ff9800",
            color: "#fff",
            textAlign: "center",
            py: 0.5,
            fontSize: "0.8rem",
            fontWeight: "bold",
            letterSpacing: 1,
            zIndex: 9999,
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          ⚠ 测试环境 — 数据与生产隔离 ⚠
        </Box>
      )}
      <Box sx={{ display: "flex", minHeight: "100vh", ...(isTestEnv ? { mt: "28px" } : {}) }}>
        <Box
          component="nav"
          sx={{
            width: { md: drawerWidth },
            flexShrink: { md: 0 },
            transition: "width 0.2s ease-in-out",
          }}
        >
          {/* 移动端抽屉 */}
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{
              display: { xs: "block", md: "none" },
              "& .MuiDrawer-paper": { width: DRAWER_WIDTH },
            }}
          >
            {drawerContent}
          </Drawer>

          {/* 桌面端永久抽屉 */}
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: "none", md: "block" },
              "& .MuiDrawer-paper": {
                width: drawerWidth,
                transition: "width 0.2s ease-in-out",
                overflowX: "hidden",
              },
            }}
            open
          >
            {drawerContent}
          </Drawer>
        </Box>

        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
          <AppBar
            position="static"
            color="default"
            elevation={0}
            sx={{ borderBottom: "1px solid #e0e0e0", bgcolor: "#fff" }}
          >
            <Toolbar variant="dense">
              <IconButton
                edge="start"
                sx={{ mr: 2, display: { md: "none" } }}
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                <MenuIcon />
              </IconButton>
              <Box sx={{ flexGrow: 1 }} />

              {/* 店铺切换 */}
              <FormControl size="small" sx={{ minWidth: 160, mr: 2 }}>
                <InputLabel>当前店铺</InputLabel>
                <Select
                  value={storeId}
                  label="当前店铺"
                  onChange={(e) => switchStore(e.target.value)}
                >
                  {stores.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* 用户信息 */}
              {isAuthenticated && user ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Avatar src={user.avatar_url} sx={{ width: 28, height: 28 }} />
                  <Typography variant="body2">{user.name}</Typography>
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  sx={{ cursor: "pointer", color: "primary.main" }}
                  onClick={() => router.push("/login")}
                >
                  登录
                </Typography>
              )}
            </Toolbar>
          </AppBar>
          <Box sx={{ flexGrow: 1, p: 3, bgcolor: "#f5f5f5" }}>
            <Box sx={{ p: 3, bgcolor: "#fff", borderRadius: 2, minHeight: "calc(100vh - 120px)" }}>
              {children}
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
