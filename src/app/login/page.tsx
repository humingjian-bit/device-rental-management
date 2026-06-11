"use client";

import { Box, Typography, Button, Card, CardContent } from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";

export default function LoginPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      <Card sx={{ maxWidth: 420, width: "100%", mx: 2, borderRadius: 3, boxShadow: 6 }}>
        <CardContent sx={{ textAlign: "center", py: 6, px: 4 }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 3,
            }}
          >
            <Typography variant="h4" sx={{ color: "#fff" }}>
              📦
            </Typography>
          </Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            设备租赁管理
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            请使用飞书账号登录系统
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<LoginIcon />}
            href="/api/auth/feishu/login"
            sx={{
              textTransform: "none",
              px: 4,
              py: 1.5,
              borderRadius: 2,
              fontSize: "1rem",
            }}
          >
            飞书登录
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3 }}>
            首次使用请联系管理员开通权限
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
