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
    const content = fs.readFileSync(configPath, "utf-8");
    const config = yaml.load(content) as UsersConfig;
    return config.users || [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "请输入用户名和密码" },
        { status: 400 }
      );
    }

    const users = loadUsers();
    const user = users.find((u) => u.username === username);

    if (!user) {
      return NextResponse.json(
        { error: "用户名或密码错误" },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

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

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "登录失败，请稍后重试" },
      { status: 500 }
    );
  }
}
