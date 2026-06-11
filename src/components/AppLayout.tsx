"use client";

import React from "react";
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
} from "@mui/material";
import {
  Home as HomeIcon,
  Devices as DevicesIcon,
  Inventory as InventoryIcon,
  Description as OrderIcon,
  Build as RepairIcon,
  Store as StoreIcon,
  Menu as MenuIcon,
  Logout as LogoutIcon,
} from "@mui/icons-material";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { useCurrentStore, useStores, useAuth } from "@/hooks/useStore";

const DRAWER_WIDTH = 220;

const menuItems = [
  { key: "/", icon: <HomeIcon />, label: "首页" },
  { key: "/device", icon: <DevicesIcon />, label: "设备管理" },
  { key: "/inventory", icon: <InventoryIcon />, label: "库存管理" },
  { key: "/order", icon: <OrderIcon />, label: "订单管理" },
  { key: "/repair", icon: <RepairIcon />, label: "维修管理" },
];

const theme = createTheme({
  palette: {
    primary: { main: "#1976d2" },
    background: { default: "#f5f5f5" },
  },
  typography: { fontSize: 14 },
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { storeId, switchStore } = useCurrentStore();
  const { stores } = useStores();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const drawerContent = (
    <Box>
      <Box
        sx={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: "1px solid #e0e0e0",
        }}
      >
        <StoreIcon sx={{ mr: 1, color: "primary.main" }} />
        <Typography variant="subtitle1" fontWeight="bold">
          设备租赁管理
        </Typography>
      </Box>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.key} disablePadding>
            <ListItemButton
              selected={pathname === item.key}
              onClick={() => router.push(item.key)}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", minHeight: "100vh" }}>
        <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
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
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: "none", md: "block" },
              "& .MuiDrawer-paper": { width: DRAWER_WIDTH },
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
