"use client";

import { useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
} from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "登录失败");
        setLoading(false);
        return;
      }

      // 登录成功，跳转到首页
      window.location.href = "/";
    } catch {
      setError("网络错误，请稍后重试");
      setLoading(false);
    }
  };

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
            请使用账号密码登录系统
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2, textAlign: "left" }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              sx={{ mb: 2 }}
              required
              autoComplete="username"
            />
            <TextField
              fullWidth
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 3 }}
              required
              autoComplete="current-password"
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <LoginIcon />}
              disabled={loading}
              sx={{
                textTransform: "none",
                py: 1.5,
                borderRadius: 2,
                fontSize: "1rem",
              }}
            >
              {loading ? "登录中..." : "登录"}
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3 }}>
            首次使用请联系管理员开通权限
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
