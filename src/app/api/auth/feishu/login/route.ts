import { NextResponse } from "next/server";
import { getLoginUrl } from "@/lib/auth";

// P0-006修复：添加 force-dynamic 防止 redirect_uri 为空
export const dynamic = 'force-dynamic';

export async function GET() {
  const loginUrl = getLoginUrl();
  return NextResponse.redirect(loginUrl);
}
