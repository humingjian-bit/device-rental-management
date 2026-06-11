#!/bin/bash
cd ~/device-rental

# AppLayout.tsx
printf '%s' '"use client";
import React from "react";
import { Select, ThemeProvider, createTheme, CssBaseline, Box, Typography, IconButton, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, AppBar, Toolbar } from "@mui/material";
import { Home as HomeIcon, Devices as DevicesIcon, Inventory as InventoryIcon, Description as OrderIcon, Build as RepairIcon, Store as StoreIcon, Menu as MenuIcon } from "@mui/icons-material";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
const DRAWER_WIDTH = 220;
const menuItems = [
  { key: "/", icon: <HomeIcon />, label: "首页" },
  { key: "/device", icon: <DevicesIcon />, label: "设备管理" },
  { key: "/inventory", icon: <InventoryIcon />, label: "库存管理" },
  { key: "/order", icon: <OrderIcon />, label: "订单管理" },
  { key: "/repair", icon: <RepairIcon />, label: "维修管理" },
];
const storeOptions = [{ value: "nantong", label: "指向-南通" }];
const theme = createTheme({ palette: { primary: { main: "#1976d2" }, background: { default: "#f5f5f5" } }, typography: { fontSize: 14 } });
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentStore, setCurrentStore] = useState("nantong");
  const drawerContent = (
    <Box>
      <Box sx={{ height: 56, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #e0e0e0" }}>
        <StoreIcon sx={{ mr: 1, color: "primary.main" }} />
        <Typography variant="subtitle1" fontWeight="bold">设备租赁管理</Typography>
      </Box>
      <List>{menuItems.map((item) => (
        <ListItem key={item.key} disablePadding>
          <ListItemButton selected={pathname === item.key} onClick={() => router.push(item.key)}>
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        </ListItem>))}</List>
    </Box>
  );
  return (<ThemeProvider theme={theme}><CssBaseline /><Box sx={{ display: "flex", minHeight: "100vh" }}>
    <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: DRAWER_WIDTH } }}>{drawerContent}</Drawer>
      <Drawer variant="permanent" sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { width: DRAWER_WIDTH } }} open>{drawerContent}</Drawer>
    </Box>
    <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: "1px solid #e0e0e0", bgcolor: "#fff" }}>
        <Toolbar variant="dense">
          <IconButton edge="start" sx={{ mr: 2, display: { md: "none" } }} onClick={() => setMobileOpen(!mobileOpen)}><MenuIcon /></IconButton>
          <Box sx={{ flexGrow: 1 }} />
          <Select size="small" value={currentStore} onChange={(e) => setCurrentStore(e.target.value)} sx={{ minWidth: 160 }}>
            {storeOptions.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </Select>
        </Toolbar>
      </AppBar>
      <Box sx={{ flexGrow: 1, p: 3, bgcolor: "#f5f5f5" }}>
        <Box sx={{ p: 3, bgcolor: "#fff", borderRadius: 2, minHeight: "calc(100vh - 120px)" }}>{children}</Box>
      </Box>
    </Box></Box></ThemeProvider>);
}
' > src/components/AppLayout.tsx

# API route
printf '%s' 'import { NextResponse } from "next/server";
import YAML from "yaml";
import fs from "fs";
import path from "path";
export async function GET() {
  try {
    const configPath = path.join(process.cwd(), "src/config/stores.yaml");
    const fileContents = fs.readFileSync(configPath, "utf8");
    const config = YAML.parse(fileContents);
    const safeStores = config.stores.map((store: Record<string, unknown>) => ({
      id: store.id, name: store.name, default_warehouse: store.default_warehouse, platforms: store.platforms || [],
    }));
    return NextResponse.json({ stores: safeStores });
  } catch (error) { return NextResponse.json({ error: "Failed to load config" }, { status: 500 }); }
}
' > src/app/api/config/stores/route.ts

# stores.yaml
printf '%s' 'app:
  app_id: "cli_a90ec606a4b85bd3"
stores:
  - id: "nantong"
    name: "指向-南通"
    base_token: "IUaybahQAal7fAsCQzVc2nJDnmh"
    tables:
      device: "tblVxflMiJ59wI51"
      inventory: "tbl5PockypnrZmJw"
      order: "tbllVh1wZWnzq7Uw"
      repair: "tblbWVjbeXtJiNAp"
    default_warehouse: "南通仓"
    platforms:
      - name: "优品租"
        parser: "youpinzu"
      - name: "惠租"
        parser: "huizu"
      - name: "人人租"
        parser: "renrenzu"
      - name: "诚赁"
        parser: "chenglin"
roles:
  admin:
    - manage_permissions
    - all_operations
  operator:
    - view_all
    - edit_device
    - edit_inventory
    - edit_order
    - edit_repair
' > src/config/stores.yaml

echo "BATCH2_OK"
find . -not -path '*/node_modules/*' -type f | sort
