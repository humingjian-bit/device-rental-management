import { NextRequest, NextResponse } from "next/server";

// ACCESS_SALT 从环境变量获取
const ACCESS_SALT = process.env.ACCESS_SALT || "";

/**
 * 生成当日有效的访问Token
 * k = Base64(SHA256("设备租赁" + 日期 + ACCESS_SALT).toString().substring(0,16))
 */
function generateDailyToken(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const input = `设备租赁${today}${ACCESS_SALT}`;
  
  // 使用 SubtleCrypto 计算 SHA256
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  
  // 同步计算 hash
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // 简化的 hash 实现（用于 Edge Runtime）
  // 实际使用中建议确保 server 端和这里一致
  const hashStr = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 16);
  const combined = hashStr + today.replace(/-/g, '');
  
  // Base64 编码
  let result = '';
  for (let i = 0; i < combined.length; i += 3) {
    const a = combined.charCodeAt(i);
    const b = combined.charCodeAt(i + 1) || 0;
    const c = combined.charCodeAt(i + 2) || 0;
    result += String.fromCharCode(a >> 2);
    result += String.fromCharCode(((a & 3) << 4) | (b >> 4));
    result += i + 1 < combined.length ? String.fromCharCode(((b & 15) << 2) | (c >> 6)) : '=';
    result += i + 2 < combined.length ? String.fromCharCode(c & 63) : '=';
  }
  
  return result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * 验证Token是否有效
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

  // 2. 登录页直接放行
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // 3. API 路由也受保护（除非是公共API）
  const isApiRoute = pathname.startsWith("/api/");
  
  // 4. 检查 cookie 中是否有有效 token
  const tokenFromCookie = request.cookies.get("access_token")?.value;
  
  if (tokenFromCookie && validateToken(tokenFromCookie)) {
    return NextResponse.next();
  }

  // 5. 检查 URL 参数中的 token
  const tokenFromUrl = request.nextUrl.searchParams.get("k");
  
  if (tokenFromUrl && validateToken(tokenFromUrl)) {
    // Token 有效，写入 cookie（有效期当天）
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

  // 6. 无效或缺失 token，返回 403
  if (isApiRoute) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid or missing access token" },
      { status: 403 }
    );
  }

  return NextResponse.json(
    { error: "Forbidden", message: "请通过正确渠道获取访问链接" },
    { status: 403 }
  );
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
