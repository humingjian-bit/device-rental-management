import { NextRequest, NextResponse } from "next/server";
import { getStoreConfig } from "@/lib/config";
import {
  listBitableRecords,
  getBitableRecord,
  createBitableRecord,
  updateBitableRecord,
  listBitableFields,
} from "@/lib/feishu";

interface FieldDef {
  field_id: string;
  field_name: string;
  type: number;
  ui_type: string;
  property?: {
    target_field?: string;
    options?: Array<{ id: string; name: string }>;
  };
}

/**
 * Phase 3: 解析搜索语法
 * 支持：
 * - SN:xxx 精确匹配SN编码
 * - 型号:xxx 精确匹配设备型号
 * - 平台:xxx 精确匹配发货平台
 * - 状态:xxx 精确匹配订单状态
 * - 无前缀：全字段模糊搜索（返回后端无法处理的说明）
 */
function parseSearchQuery(search: string): { filters: string[]; isServerSide: boolean } {
  if (!search.trim()) {
    return { filters: [], isServerSide: false };
  }

  const filters: string[] = [];
  const prefixes = ["SN:", "型号:", "平台:", "状态:"];
  
  for (const prefix of prefixes) {
    if (search.startsWith(prefix)) {
      const value = search.slice(prefix.length).trim();
      if (value) {
        // 构建立即数过滤条件
        if (prefix === "SN:") {
          filters.push(`CurrentValue.["SN编码（最最重要）"] = "${value}"`);
        } else if (prefix === "型号:") {
          filters.push(`CurrentValue.["租机型号"] = "${value}"`);
        } else if (prefix === "平台:") {
          filters.push(`CurrentValue.["发货平台"] = "${value}"`);
        } else if (prefix === "状态:") {
          filters.push(`CurrentValue.["状态"] = "${value}"`);
        }
      }
      return { filters, isServerSide: true };
    }
  }

  // 无前缀：全字段模糊搜索，需要前端处理
  return { filters: [], isServerSide: false };
}

// GET /api/base/[store]/[table] — 查询记录列表或字段定义
export async function GET(
  request: NextRequest,
  { params }: { params: { store: string; table: string } }
) {
  const { store: storeId, table: tableName } = params;
  const store = getStoreConfig(storeId);

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const tableId = store.tables[tableName as keyof typeof store.tables];
  if (!tableId) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");

  if (action === "fields") {
    try {
      const fields = await listBitableFields(store.base_token, tableId);
      return NextResponse.json({ fields });
    } catch (error) {
      console.error("Failed to list fields:", error);
      return NextResponse.json(
        { error: "Failed to fetch field definitions" },
        { status: 500 }
      );
    }
  }

  if (action === "get") {
    const recordId = searchParams.get("id");
    if (!recordId) {
      return NextResponse.json({ error: "Missing record id" }, { status: 400 });
    }
    try {
      const record = await getBitableRecord(store.base_token, tableId, recordId);
      return NextResponse.json({ record });
    } catch (error) {
      console.error("Failed to get record:", error);
      return NextResponse.json(
        { error: "Failed to fetch record" },
        { status: 500 }
      );
    }
  }

  // Phase 3: 获取记录列表时支持搜索
  const pageSize = Number(searchParams.get("page_size")) || 20;
  const pageToken = searchParams.get("page_token") || undefined;
  const filter = searchParams.get("filter") || undefined;
  const sort = searchParams.get("sort") || undefined;
  const search = searchParams.get("search") || undefined;

  // Phase 3: 解析搜索语法，构建设件filter
  let finalFilter = filter;
  if (search) {
    const { filters } = parseSearchQuery(search);
    if (filters.length > 0) {
      finalFilter = filters.join(" && ");
    }
  }

  try {
    // 获取当前表和设备表的字段定义，用于Lookup字段映射
    const [fields, deviceFields] = await Promise.all([
      listBitableFields(store.base_token, tableId) as Promise<FieldDef[]>,
      listBitableFields(store.base_token, store.tables.device) as Promise<FieldDef[]>,
    ]);

    // 构建设备表的options映射表（按field_id索引）
    const deviceOptionsByFieldId: Record<string, { id: string; name: string }[]> = {};
    for (const field of deviceFields) {
      if (field.property?.options) {
        deviceOptionsByFieldId[field.field_id] = field.property.options;
      }
    }

    // 找到所有Lookup字段及其关联的设备表字段
    const lookupFieldMapping: { lookupField: string; deviceFieldId: string }[] = [];
    for (const field of fields) {
      if (field.type === 19 && field.ui_type === "Lookup" && field.property?.target_field) {
        lookupFieldMapping.push({
          lookupField: field.field_name,
          deviceFieldId: field.property.target_field,
        });
      }
    }

    const result = await listBitableRecords(store.base_token, tableId, {
      page_size: pageSize,
      page_token: pageToken,
      filter: finalFilter,
      sort,
    });

    // 转换Lookup字段的选项ID为选项名称
    const processedItems = result.items.map((item: Record<string, unknown>) => {
      const processed: Record<string, unknown> = { ...item };
      
      for (const mapping of lookupFieldMapping) {
        const value = processed[mapping.lookupField];
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string" && (value[0] as string).startsWith("opt")) {
          const options = deviceOptionsByFieldId[mapping.deviceFieldId];
          if (options) {
            const names = (value as string[]).map((id) => {
              const opt = options.find((o) => o.id === id);
              return opt ? opt.name : id;
            });
            processed[mapping.lookupField] = names;
          }
        }
      }
      
      return processed;
    });

    return NextResponse.json({
      items: processedItems,
      total: result.total,
      has_more: result.has_more,
      page_token: result.page_token,
    });
  } catch (error) {
    console.error("Failed to list records:", error);
    return NextResponse.json(
      { error: "Failed to fetch records" },
      { status: 500 }
    );
  }
}

// POST — 创建记录
export async function POST(
  request: NextRequest,
  { params }: { params: { store: string; table: string } }
) {
  const { store: storeId, table: tableName } = params;
  const store = getStoreConfig(storeId);

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const tableId = store.tables[tableName as keyof typeof store.tables];
  if (!tableId) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  try {
    const fields = await request.json();
    const record = await createBitableRecord(store.base_token, tableId, fields);
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    console.error("Failed to create record:", error);
    return NextResponse.json(
      { error: "Failed to create record" },
      { status: 500 }
    );
  }
}

// PUT — 更新记录
export async function PUT(
  request: NextRequest,
  { params }: { params: { store: string; table: string } }
) {
  const { store: storeId, table: tableName } = params;
  const store = getStoreConfig(storeId);

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const tableId = store.tables[tableName as keyof typeof store.tables];
  if (!tableId) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { record_id, ...fields } = body;

    if (!record_id) {
      return NextResponse.json({ error: "Missing record_id" }, { status: 400 });
    }

    const record = await updateBitableRecord(
      store.base_token,
      tableId,
      record_id,
      fields
    );
    return NextResponse.json({ record });
  } catch (error) {
    console.error("Failed to update record:", error);
    return NextResponse.json(
      { error: "Failed to update record" },
      { status: 500 }
    );
  }
}
