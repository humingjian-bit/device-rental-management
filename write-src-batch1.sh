#!/bin/bash
cd ~/device-rental

# layout.tsx
printf '%s' 'import type { Metadata } from "next";
import AppLayout from "@/components/AppLayout";
export const metadata: Metadata = { title: "设备租赁管理系统", description: "设备租赁管理系统" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="zh-CN"><body><AppLayout>{children}</AppLayout></body></html>);
}
' > src/app/layout.tsx

# page.tsx
printf '%s' '"use client";
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
    </Grid></Box>);
}
' > src/app/page.tsx

# device page
printf '%s' '"use client";import { Box, Typography } from "@mui/material";
export default function DevicePage(){return <Box><Typography variant="h5" fontWeight="bold" gutterBottom>设备管理</Typography><Typography color="text.secondary">待实现</Typography></Box>;}
' > src/app/device/page.tsx

# inventory page
printf '%s' '"use client";import { Box, Typography } from "@mui/material";
export default function InventoryPage(){return <Box><Typography variant="h5" fontWeight="bold" gutterBottom>库存管理</Typography><Typography color="text.secondary">待实现</Typography></Box>;}
' > src/app/inventory/page.tsx

# order page
printf '%s' '"use client";import { Box, Typography } from "@mui/material";
export default function OrderPage(){return <Box><Typography variant="h5" fontWeight="bold" gutterBottom>订单管理</Typography><Typography color="text.secondary">待实现</Typography></Box>;}
' > src/app/order/page.tsx

# repair page
printf '%s' '"use client";import { Box, Typography } from "@mui/material";
export default function RepairPage(){return <Box><Typography variant="h5" fontWeight="bold" gutterBottom>维修管理</Typography><Typography color="text.secondary">待实现</Typography></Box>;}
' > src/app/repair/page.tsx

# login page
printf '%s' '"use client";import { Box, Typography, Button, Card, CardContent } from "@mui/material";import LoginIcon from "@mui/icons-material/Login";
export default function LoginPage(){return(<Box sx={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",bgcolor:"#f5f5f5"}}><Card sx={{maxWidth:400,width:"100%",mx:2}}><CardContent sx={{textAlign:"center",py:5}}><Typography variant="h4" fontWeight="bold" gutterBottom>设备租赁管理</Typography><Typography color="text.secondary" sx={{mb:4}}>请使用飞书账号登录</Typography><Button variant="contained" size="large" startIcon={<LoginIcon/>} href="/api/auth/feishu/login" sx={{textTransform:"none"}}>飞书登录</Button></CardContent></Card></Box>);}
' > src/app/login/page.tsx

echo "BATCH1_OK"
