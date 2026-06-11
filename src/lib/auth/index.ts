import { cookies } from "next/headers";
import { loadConfig } from "../config";

const REDIRECT_URI = process.env.FEISHU_REDIRECT_URI || "";

export interface AuthUser {
  user_id: string;
  name: string;
  avatar_url: string;
  open_id: string;
}

/**
 * 生成飞书 OAuth 登录 URL
 */
export function getLoginUrl(): string {
  const config = loadConfig();
  const params = new URLSearchParams({
    app_id: config.app_id,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    state: "feishu_login",
  });
  return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
}

/**
 * 从 cookie 中获取当前登录用户
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const userStr = cookieStore.get("feishu_user")?.value;
  if (!userStr) return null;

  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * 将用户信息写入 cookie
 */
export async function setUserCookie(user: AuthUser): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("feishu_user", JSON.stringify(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

/**
 * 清除用户 cookie（登出）
 */
export async function clearUserCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("feishu_user");
}
