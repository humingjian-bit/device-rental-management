import { NextRequest, NextResponse } from "next/server";
import { getStoreConfig } from "@/lib/config";
import {
  listBitableRecords,
  searchBitableRecords,
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

// 模糊搜索：只搜索这3个关键字段
const FUZZY_SEARCH_FIELDS = ["SN编码", "设备型号", "分类"];

/**
 * 模糊匹配：只匹配关键字段
 */
function fuzzyMatch(item: Record<string, unknown>, keyword: string): boolean {
  const lowerKeyword = keyword.toLowerCase();
  for (const field of FUZZY_SEARCH_FIELDS) {
    const value = item[field];
    if (value === null || value === undefined) continue;
    
    const strValue = Array.isArray(value) 
      ? value.join(" ").toLowerCase() 
      : String(value).toLowerCase();
    
    if (strValue.includes(lowerKeyword)) return true;
  }
  return false;
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

  // 获取记录列表参数
  const pageSize = Number(searchParams.get("page_size")) || 20;
  const pageToken = searchParams.get("page_token") || undefined;
  const filter = searchParams.get("filter") || undefined;
  const sort = searchParams.get("sort") || undefined;
  
  // 搜索参数
  const search = searchParams.get("search") || undefined;  // 模糊搜索关键词
  const searchField = searchParams.get("search_field") || undefined;  // 精确搜索字段名
  const searchValue = searchParams.get("search_value") || undefined;  // 精确搜索值
  const searchMode = searchParams.get("search_mode") || "fuzzy";  // fuzzy 或 exact
  
  // 调试日志
  console.log(`[搜索] mode=${searchMode}, field=${searchField}, value=${searchValue}`);

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

    // 构建字段名到ID的映射
    const fieldNameToId: Record<string, string> = {};
    for (const field of fields) {
      fieldNameToId[field.field_name] = field.field_id;
    }

    // 处理高级搜索（精确匹配）
    // 注意：由于飞书filter API有限制，现在改用后端过滤方式
    // searchField 和 searchValue 会在下面代码中直接使用

    // 合并filter：优先使用高级搜索filter，其次使用传入的filter
    const finalFilter = filter; // 不使用advancedFilter，改用后端过滤

    let allItems: Record<string, unknown>[] = [];
    let totalCount = 0;
    let hasMore = true;
    let nextPageToken: string | undefined = undefined;

    // 搜索模式处理
    if (searchMode === "exact" && searchField && searchValue) {
      // 精确搜索：使用飞书原生search API进行服务端筛选
      // 根据字段类型选择合适的操作符
      const fieldDef = fields.find(f => f.field_name === searchField);
      let operator = "contains"; // 默认使用contains
      
      if (fieldDef) {
        // 数字字段使用 is 操作符
        if (fieldDef.type === 1 || fieldDef.ui_type === "Number") {
          operator = "is";
        }
        // 多选字段使用 contains
        else if (fieldDef.ui_type === "MultipleSelect" || fieldDef.ui_type === "Checkbox") {
          operator = "contains";
        }
        // 单选字段可以使用 is
        else if (fieldDef.ui_type === "SingleSelect" || fieldDef.ui_type === "Radio") {
          operator = "is";
        }
        // 文本字段使用 contains
        else {
          operator = "contains";
        }
      }

      try {
        // 优先使用飞书search API（服务端筛选）
        const searchResult = await searchBitableRecords(store.base_token, tableId, {
          filter: {
            conjunction: "and",
            conditions: [
              {
                field_name: searchField,
                operator: operator,
                value: [searchValue],
              },
            ],
          },
          page_size: pageSize,
          page_token: pageToken,
          sort,
        });

        // 转换Lookup字段
        allItems = searchResult.items.map((item: Record<string, unknown>) => {
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

        totalCount = searchResult.total;
        hasMore = searchResult.has_more;
        nextPageToken = searchResult.page_token;
      } catch (searchError) {
        console.error(`[搜索] 飞书search API失败，回退到后端过滤: ${searchError}`);
        
        // 回退方案：获取全部数据后端过滤
        const MAX_TOTAL = 500;
        let currentToken: string | undefined = undefined;

        while (allItems.length < MAX_TOTAL) {
          const result = await listBitableRecords(store.base_token, tableId, {
            page_size: 100,
            page_token: currentToken,
            filter: undefined,
            sort,
          });

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

          const matchedItems = processedItems.filter((item) => {
            const fieldValue = item[searchField];
            if (fieldValue === null || fieldValue === undefined || fieldValue === "") {
              return searchValue === "";
            }
            if (Array.isArray(fieldValue)) {
              return fieldValue.some(v => String(v) === searchValue);
            }
            return String(fieldValue) === searchValue;
          });

          allItems = allItems.concat(matchedItems);

          if (!result.has_more || !result.page_token) break;
          currentToken = result.page_token;
        }

        totalCount = allItems.length;
        const pageItems = allItems.slice(0, pageSize);
        hasMore = allItems.length > pageSize;
        nextPageToken = hasMore ? "exact_page_2" : undefined;
        allItems = pageItems;
      }
    } else if (search) {
      // 模糊搜索：获取全部数据，后端过滤（只搜索3个关键字段）
      const MAX_TOTAL = 500; // 限制获取量，避免太慢
      let currentToken: string | undefined = undefined;
      
      // 先获取一页获取总数
      const firstPage = await listBitableRecords(store.base_token, tableId, {
        page_size: 1,
        page_token: undefined,
        filter: undefined,
        sort,
      });
      totalCount = firstPage.total;

      // 如果总数太多，提示前端
      if (totalCount > MAX_TOTAL) {
        // 获取部分数据用于模糊过滤
        while (allItems.length < MAX_TOTAL) {
          const result = await listBitableRecords(store.base_token, tableId, {
            page_size: 100,
            page_token: currentToken,
            filter: undefined,
            sort,
          });

          // 转换Lookup并过滤
          const filteredItems = result.items
            .map((item: Record<string, unknown>) => {
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
            })
            .filter((item) => fuzzyMatch(item, search));

          allItems = allItems.concat(filteredItems);
          
          if (!result.has_more || !result.page_token) break;
          currentToken = result.page_token;
        }

        // 对过滤结果分页
        allItems = allItems.slice(0, pageSize);
        hasMore = allItems.length < totalCount && allItems.length >= pageSize;
      } else {
        // 总数不多，可以获取全部
        while (hasMore && allItems.length < MAX_TOTAL) {
          const result = await listBitableRecords(store.base_token, tableId, {
            page_size: 100,
            page_token: currentToken,
            filter: undefined,
            sort,
          });

          // 转换Lookup字段
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

          allItems = allItems.concat(processedItems);
          hasMore = result.has_more && !!result.page_token;
          currentToken = result.page_token;

          if (!hasMore) break;
        }

        // 后端模糊过滤
        const filteredItems = allItems.filter((item) => fuzzyMatch(item, search));
        
        // 对过滤结果分页
        allItems = filteredItems.slice(0, pageSize);
        totalCount = filteredItems.length;
        hasMore = filteredItems.length > pageSize;
      }
    } else {
      // 普通模式：正常分页获取
      const result = await listBitableRecords(store.base_token, tableId, {
        page_size: pageSize,
        page_token: pageToken,
        filter: finalFilter,
        sort,
      });

      // 转换Lookup字段
      allItems = result.items.map((item: Record<string, unknown>) => {
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

      totalCount = result.total;
      hasMore = result.has_more;
      nextPageToken = result.page_token;
    }

    return NextResponse.json({
      items: allItems,
      total: totalCount,
      has_more: hasMore,
      page_token: nextPageToken,
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
    const { record_id, ...fields } = await request.json();
    if (!record_id) {
      return NextResponse.json({ error: "Missing record_id" }, { status: 400 });
    }
    const record = await updateBitableRecord(store.base_token, tableId, record_id, fields);
    return NextResponse.json({ record });
  } catch (error) {
    console.error("Failed to update record:", error);
    return NextResponse.json(
      { error: "Failed to update record" },
      { status: 500 }
    );
  }
}
