import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

interface User {
  username: string;
  password_hash: string;
  role: string;
}

interface UsersConfig {
  users: User[];
}

function loadUsers(): User[] {
  try {
    const configPath = path.join(process.cwd(), "config", "users.yaml");
    console.log("[Login] Config path:", configPath);
    const content = fs.readFileSync(configPath, "utf-8");
    console.log("[Login] File content length:", content.length);
    const config = yaml.load(content) as UsersConfig;
    console.log("[Login] Config:", JSON.stringify(config));
    return config.users || [];
  } catch (error) {
    console.error("[Login] Load users error:", error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    console.log("[Login] Username:", username);

    if (!username || !password) {
      return NextResponse.json(
        { error: "请输入用户名和密码" },
        { status: 400 }
      );
    }

    const users = loadUsers();
    console.log("[Login] Users loaded:", users.length);
    
    const user = users.find((u) => u.username === username);
    console.log("[Login] User found:", user ? "yes" : "no");

    if (!user) {
      console.log("[Login] User not found");
      return NextResponse.json(
        { error: "用户名或密码错误" },
        { status: 401 }
      );
    }

    console.log("[Login] Comparing password...");
    const isValid = await bcrypt.compare(password, user.password_hash);
    console.log("[Login] Password valid:", isValid);

    if (!isValid) {
      return NextResponse.json(
        { error: "用户名或密码错误" },
        { status: 401 }
      );
    }

    // 生成session token
    const sessionToken = Buffer.from(
      `${username}:${Date.now()}`
    ).toString("base64");

    const response = NextResponse.json({
      success: true,
      username: user.username,
      role: user.role,
    });

    // 设置session cookie（24小时有效）
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    response.cookies.set("session", sessionToken, {
      expires: tomorrow,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });

    console.log("[Login] Login success for user:", username);
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "登录失败，请稍后重试" },
      { status: 500 }
    );
  }
}
