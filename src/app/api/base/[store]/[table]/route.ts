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
 * 统一格式化飞书字段值
 * 处理search API返回的各种格式
 */
function formatFieldValue(value: unknown, fieldDef?: FieldDef, optionsMap?: Record<string, { id: string; name: string }[]>): unknown {
  if (value === null || value === undefined) return value;
  
  // 1. 关联字段格式: {link_record_ids: [...]}
  if (typeof value === 'object' && !Array.isArray(value) && 'link_record_ids' in value) {
    const linkValue = value as { link_record_ids?: string[] };
    return linkValue.link_record_ids || [];
  }
  
  // 2. 公式/自动编号格式: {type: N, value: [...]}
  if (typeof value === 'object' && !Array.isArray(value) && 'type' in value && 'value' in value) {
    const typedValue = value as { type?: number; value?: unknown[] };
    if (Array.isArray(typedValue.value)) {
      // 如果value是对象数组（如富文本），提取text字段
      if (typedValue.value.length > 0 && typeof typedValue.value[0] === 'object') {
        return typedValue.value.map((v: unknown) => {
          if (typeof v === 'object' && v !== null && 'text' in v) {
            return (v as { text: unknown }).text;
          }
          return v;
        });
      }
      // 直接返回value数组
      return typedValue.value;
    }
  }
  
  // 3. 富文本数组格式: [{text: "...", type: "text"}]
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && 'text' in (value[0] as object)) {
    return (value as Array<{ text?: unknown }>).map(v => v.text).filter(Boolean);
  }
  
  // 4. 选项字段格式（需要转换为名称）
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    const firstStr = (value as string[])[0];
    // 如果是选项ID（以opt开头），尝试转换
    if (firstStr.startsWith('opt') && optionsMap) {
      return (value as string[]).map(id => {
        for (const opts of Object.values(optionsMap)) {
          const opt = opts.find(o => o.id === id);
          if (opt) return opt.name;
        }
        return id;
      });
    }
    // 如果是Lookup值（如设备型号），直接返回
    return value;
  }
  
  // 5. 其他情况直接返回
  return value;
}

/**
 * 统一格式化记录的所有字段
 * 特别处理lookup字段，获取关联记录的实际值
 */
async function formatRecordAsync(
  record: Record<string, unknown>,
  fields: FieldDef[],
  store: { base_token: string; tables: Record<string, string> },
  deviceOptionsByFieldId: Record<string, { id: string; name: string }[]>,
  deviceFields: FieldDef[]
): Promise<Record<string, unknown>> {
  const formatted: Record<string, unknown> = { ...record };
  
  // 找到所有Lookup字段及其关联的设备表字段
  for (const field of fields) {
    if (field.type === 19 && field.property?.target_field) {
      // 这是一个lookup字段
      const value = formatted[field.field_name];
      if (value && typeof value === 'object' && 'link_record_ids' in value) {
        const linkValue = value as { link_record_ids?: string[] };
        const recordIds = linkValue.link_record_ids || [];
        
        if (recordIds.length > 0) {
          // 找到关联的设备表
          // 需要根据target_field找到对应的设备表
          // 通常lookup是关联到设备表tblVxflMiJ59wI51
          const deviceTableId = store.tables.device;
          
          // 找到target_field对应的设备表字段
          const targetDeviceField = deviceFields.find(f => f.field_id === field.property.target_field);
          
          if (targetDeviceField) {
            // 获取关联记录的实际值
            const displayValues: string[] = [];
            for (const recordId of recordIds) {
              try {
                const linkedRecord = await getBitableRecord(store.base_token, deviceTableId, recordId);
                const fieldsData = linkedRecord.fields as Record<string, unknown>;
                const displayValue = fieldsData[targetDeviceField.field_name];
                if (displayValue !== null && displayValue !== undefined) {
                  // 格式化显示值
                  if (Array.isArray(displayValue)) {
                    displayValues.push(...displayValue.map(v => String(v)));
                  } else {
                    displayValues.push(String(displayValue));
                  }
                }
              } catch (e) {
                console.error(`[lookup] 获取关联记录失败: ${recordId}`, e);
              }
            }
            formatted[field.field_name] = displayValues;
          }
        } else {
          formatted[field.field_name] = [];
        }
      }
    } else {
      // 非lookup字段，使用原有格式化逻辑
      const value = formatted[field.field_name];
      if (value !== null && value !== undefined) {
        formatted[field.field_name] = formatFieldValue(value, field, deviceOptionsByFieldId);
      }
    }
  }
  
  return formatted;
}

/**
 * 同步版本的formatRecord，用于不需要lookup处理的场景
 */
function formatRecord(record: Record<string, unknown>, fields: FieldDef[], optionsMap?: Record<string, { id: string; name: string }[]>): Record<string, unknown> {
  const formatted: Record<string, unknown> = { ...record };
  
  for (const field of fields) {
    const value = formatted[field.field_name];
    if (value !== null && value !== undefined) {
      formatted[field.field_name] = formatFieldValue(value, field, optionsMap);
    }
  }
  
  return formatted;
}

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

        // 使用异步格式化函数处理所有字段（包括lookup）
        const storeConfig = { base_token: store.base_token, tables: store.tables };
        allItems = await Promise.all(
          searchResult.items.map((item: Record<string, unknown>) => 
            formatRecordAsync(item, fields, storeConfig, deviceOptionsByFieldId, deviceFields)
          )
        );

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

          const processedItems = result.items.map((item: Record<string, unknown>) => 
            formatRecord(item, fields, deviceOptionsByFieldId)
          );

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
          const processedItems = result.items.map((item: Record<string, unknown>) => 
            formatRecord(item, fields, deviceOptionsByFieldId)
          );

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

      // 使用异步格式化函数处理所有字段（包括lookup）
      const storeConfig = { base_token: store.base_token, tables: store.tables };
      allItems = await Promise.all(
        result.items.map((item: Record<string, unknown>) => 
          formatRecordAsync(item, fields, storeConfig, deviceOptionsByFieldId, deviceFields)
        )
      );

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
