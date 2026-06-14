import { NextRequest, NextResponse } from "next/server";

// ACCESS_SALT 从环境变量获取（用于URL参数token验证）
const ACCESS_SALT = process.env.ACCESS_SALT || "cLQJrhSuajJ3ibIu7PtaAbKUXYDv2sbQF5aepegDIzA=";

/**
 * 生成当日有效的访问Token（通过URL参数k传递）
 * 用于外部链接临时访问
 */
function generateDailyToken(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const input = `设备租赁${today}${ACCESS_SALT}`;
  
  // 简化的 hash 实现（用于 Edge Runtime）
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  const hashStr = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 16);
  const combined = hashStr + today.replace(/-/g, '');
  
  // Base64 编码（标准 Node.js Buffer）
  return Buffer.from(combined).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * 验证URL参数Token是否有效
 */
function validateToken(token: string): boolean {
  const expectedToken = generateDailyToken();
  return token === expectedToken;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 静态资源直接放行
  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. 登录页和OAuth回调直接放行
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth/")
  ) {
    return NextResponse.next();
  }

  // 3. API 路由也受保护
  const isApiRoute = pathname.startsWith("/api/");

  // 4. 检查是否已通过飞书登录（feishu_user cookie）
  const feishuUser = request.cookies.get("feishu_user")?.value;
  if (feishuUser) {
    return NextResponse.next();
  }

  // 4b. 检查临时访问 cookie（access_token）
  const accessToken = request.cookies.get("access_token")?.value;
  if (accessToken && validateToken(accessToken)) {
    return NextResponse.next();
  }

  // 5. 检查 URL 参数中的 token（用于临时访问链接）
  const tokenFromUrl = request.nextUrl.searchParams.get("k");
  
  if (tokenFromUrl && validateToken(tokenFromUrl)) {
    // Token 有效，写入临时 cookie（当天有效）
    const response = NextResponse.next();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    response.cookies.set("access_token", tokenFromUrl, {
      expires: tomorrow,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });
    
    return response;
  }

  // 6. API 无 token 返回 403；页面路由重定向到登录页
  if (isApiRoute) {
    const debugToken = generateDailyToken();
    return NextResponse.json(
      { error: "Unauthorized", message: "请先登录或使用有效的访问链接", debugToken },
      { status: 403 }
    );
  }

  // 页面路由 → 重定向到登录页
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了:
     * - _next/static (静态文件)
     * - _next/image (图片优化)
     * - favicon.ico (图标)
     * - 公共资源
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
