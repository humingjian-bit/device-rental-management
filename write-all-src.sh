#!/bin/bash
set -e
cd ~/device-rental

# tsconfig.json
cat > tsconfig.json << 'EOF'
{"compilerOptions":{"lib":["dom","dom.iterable","esnext"],"allowJs":true,"skipLibCheck":true,"strict":true,"noEmit":true,"esModuleInterop":true,"module":"esnext","moduleResolution":"bundler","resolveJsonModule":true,"isolatedModules":true,"jsx":"preserve","incremental":true,"plugins":[{"name":"next"}],"paths":{"@/*":["./src/*"]}},"include":["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"],"exclude":["node_modules"]}
EOF

# next.config.js
cat > next.config.js << 'EOF'
const nextConfig={output:'standalone',serverExternalPackages:['yaml']};module.exports=nextConfig
EOF

# layout.tsx
cat > src/app/layout.tsx << 'EOF'
import type { Metadata } from "next";
import AppLayout from "@/components/AppLayout";
export const metadata: Metadata = { title: "设备租赁管理系统", description: "设备租赁管理系统" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="zh-CN"><body><AppLayout>{children}</AppLayout></body></html>);
}
EOF

# AppLayout.tsx
cat > src/components/AppLayout.tsx << 'EOF'
"use client";
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
EOF

# page.tsx (home)
cat > src/app/page.tsx << 'EOF'
"use client";
import { Box, Typography, Card, CardContent, Grid2 as Grid } from "@mui/material";
import { Devices as D, Inventory as I, Description as O, Build as R } from "@mui/icons-material";
const stats = [
  { label: "设备总数", icon: <D />, value: "-" },
  { label: "库存总量", icon: <I />, value: "-" },
  { label: "进行中订单", icon: <O />, value: "-" },
  { label: "维修中设备", icon: <R />, value: "-" },
];
export default function HomePage() {
  return (<Box>
    <Typography variant="h5" fontWeight="bold" gutterBottom>首页概览</Typography>
    <Grid container spacing={2} sx={{ mt: 1 }}>
      {stats.map((s) => (
        <Grid key={s.label} size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined"><CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ color: "primary.main" }}>{s.icon}</Box>
            <Box><Typography variant="body2" color="text.secondary">{s.label}</Typography><Typography variant="h5">{s.value}</Typography></Box>
          </CardContent></Card>
        </Grid>))}
    </Grid>
  </Box>);
}
EOF

# sub pages
cat > src/app/device/page.tsx << 'EOF'
"use client";import { Box, Typography } from "@mui/material";
export default function DevicePage(){return <Box><Typography variant="h5" fontWeight="bold" gutterBottom>设备管理</Typography><Typography color="text.secondary">待实现</Typography></Box>;}
EOF

cat > src/app/inventory/page.tsx << 'EOF'
"use client";import { Box, Typography } from "@mui/material";
export default function InventoryPage(){return <Box><Typography variant="h5" fontWeight="bold" gutterBottom>库存管理</Typography><Typography color="text.secondary">待实现</Typography></Box>;}
EOF

cat > src/app/order/page.tsx << 'EOF'
"use client";import { Box, Typography } from "@mui/material";
export default function OrderPage(){return <Box><Typography variant="h5" fontWeight="bold" gutterBottom>订单管理</Typography><Typography color="text.secondary">待实现</Typography></Box>;}
EOF

cat > src/app/repair/page.tsx << 'EOF'
"use client";import { Box, Typography } from "@mui/material";
export default function RepairPage(){return <Box><Typography variant="h5" fontWeight="bold" gutterBottom>维修管理</Typography><Typography color="text.secondary">待实现</Typography></Box>;}
EOF

cat > src/app/login/page.tsx << 'EOF'
"use client";import { Box, Typography, Button, Card, CardContent } from "@mui/material";import LoginIcon from "@mui/icons-material/Login";
export default function LoginPage(){return(<Box sx={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",bgcolor:"#f5f5f5"}}><Card sx={{maxWidth:400,width:"100%",mx:2}}><CardContent sx={{textAlign:"center",py:5}}><Typography variant="h4" fontWeight="bold" gutterBottom>设备租赁管理</Typography><Typography color="text.secondary" sx={{mb:4}}>请使用飞书账号登录</Typography><Button variant="contained" size="large" startIcon={<LoginIcon/>} href="/api/auth/feishu/login" sx={{textTransform:"none"}}>飞书登录</Button></CardContent></Card></Box>);}
EOF

# API route
cat > src/app/api/config/stores/route.ts << 'EOF'
import { NextResponse } from "next/server";
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
EOF

# stores.yaml
cat > src/config/stores.yaml << 'EOF'
app:
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
EOF

echo "=== All files written ==="
find . -not -path '*/node_modules/*' -type f | sort
