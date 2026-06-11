import { NextRequest, NextResponse } from "next/server";
import { getUserAccessToken } from "@/lib/feishu";
import { setUserCookie } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  try {
    const tokenInfo = await getUserAccessToken(code);

    // 写入 cookie
    await setUserCookie({
      user_id: tokenInfo.user_id,
      name: tokenInfo.name,
      avatar_url: tokenInfo.avatar_url,
      open_id: "",
    });

    // 重定向到首页
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("OAuth callback failed:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
