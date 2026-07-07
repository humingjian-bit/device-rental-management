import { NextRequest, NextResponse } from "next/server";
import { getBitableRecord } from "@/lib/feishu";
import { getStoreConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store");
  const tableName = searchParams.get("table") || "device";
  const idsParam = searchParams.get("ids") || "";

  if (!storeId) {
    return NextResponse.json({ error: "Missing store" }, { status: 400 });
  }

  const ids = idsParam.split(",").filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ items: [] });
  }

  try {
    const store = getStoreConfig(storeId);
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    const tableId = store.tables[tableName as keyof typeof store.tables];
    if (!tableId) {
      return NextResponse.json({ error: "Unknown table" }, { status: 400 });
    }

    const items = await Promise.all(
      ids.map(async (id) => {
        try {
          const record = await getBitableRecord(store.base_token, tableId, id);
          return record;
        } catch (e: any) {
          console.error(`[batch-records] Failed to fetch record ${id}:`, e.message);
          return null;
        }
      })
    );

    const validItems = items.filter(Boolean);
    return NextResponse.json({ items: validItems });
  } catch (e: any) {
    console.error("[batch-records] Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
