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
  
  // 调试日志：打印设备表的 Lookup 字段
  console.log(`[lookup] ===== 设备表字段分析 =====`);
  for (const df of deviceFields) {
    if (df.type === 3 || df.ui_type === 'SingleSelect') {
      console.log(`[lookup] 设备表单选字段: "${df.field_name}", id=${df.field_id}, options=${df.property?.options?.map(o => `${o.id}:${o.name}`).join(', ')}`);
    }
  }
  
  // 找到所有Lookup字段及其关联的设备表字段
  console.log(`[lookup] ===== 检查订单表Lookup字段 =====`);
  for (const field of fields) {
    const isLookup = field.type === 19 || field.ui_type === 'Lookup';
    const isSingleLink = field.type === 18 || field.ui_type === 'SingleLink';
    console.log(`[lookup] 字段: "${field.field_name}", type=${field.type}, ui_type=${field.ui_type}, target_field=${field.property?.target_field}`);
    
    if (isLookup && field.property?.target_field) {
      // 打印 target_field 对应的设备表字段信息
      const targetDeviceField = deviceFields.find(f => f.field_id === field.property?.target_field);
      console.log(`[lookup] 关联的设备表字段: "${targetDeviceField?.field_name}", type=${targetDeviceField?.type}, ui_type=${targetDeviceField?.ui_type}`);
    }
    
    if (isLookup && field.property?.target_field) {
      // 这是一个Lookup字段
      // 飞书返回的Lookup值可能是选项ID数组（如 ["optxxx"]），而不是record_id
      const value = formatted[field.field_name];
      console.log(`[lookup] "${field.field_name}" 原始值:`, JSON.stringify(value));
      
      // 找到关联的设备表字段定义（用于映射选项ID到名称）
      const targetDeviceField = deviceFields.find(f => f.field_id === field.property?.target_field);
      const options = targetDeviceField?.property?.options || [];
      console.log(`[lookup] 关联字段"${targetDeviceField?.field_name}"的选项:`, options.map(o => `${o.id}:${o.name}`).join(', '));
      
      // 处理选项ID数组格式 ["optxxx"]
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string' && value[0].startsWith('opt')) {
        const displayItems: Array<{ text: string; record_ids: string[] }> = [];
        for (const optId of value as string[]) {
          // 查找选项名称
          const opt = options.find(o => o.id === optId);
          const text = opt ? opt.name : optId;
          displayItems.push({ text, record_ids: [] });
          console.log(`[lookup] 映射选项ID: ${optId} -> ${text}`);
        }
        formatted[field.field_name] = displayItems;
      }
      // 处理record_id格式（备用）
      else {
        let recordIds: string[] = [];
        
        if (value && typeof value === 'object' && 'link_record_ids' in value) {
          const linkValue = value as { link_record_ids?: string[] };
          recordIds = linkValue.link_record_ids || [];
        } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string' && (value[0] as string).startsWith('rec')) {
          recordIds = value as string[];
        } else if (typeof value === 'string' && value.startsWith('rec')) {
          recordIds = [value];
        }
        
        if (recordIds.length > 0) {
          const deviceTableId = store.tables.device;
          const displayItems: Array<{ text: string; record_ids: string[] }> = [];
          
          for (const recordId of recordIds) {
            try {
              const linkedRecord = await getBitableRecord(store.base_token, deviceTableId, recordId);
              const displayValue = linkedRecord[targetDeviceField!.field_name];
              let text = "";
              if (displayValue !== null && displayValue !== undefined) {
                if (Array.isArray(displayValue)) {
                  text = displayValue.map(v => String(v)).join(", ");
                } else {
                  text = String(displayValue);
                }
              }
              displayItems.push({ text, record_ids: [recordId] });
            } catch (e) {
              console.error(`[lookup] 获取关联记录失败: recordId=${recordId}, error=${e}`);
              displayItems.push({ text: recordId, record_ids: [recordId] });
            }
          }
          formatted[field.field_name] = displayItems;
        } else {
          formatted[field.field_name] = [];
        }
      }
    } else if (field.type === 18 || field.ui_type === 'SingleLink') {
      // SingleLink(type=18) 没有 target_field，需要特殊处理
      // 小夏确认：SN编码关联的是库存表(inventory)，不是设备表
      const value = formatted[field.field_name];
      console.log(`[SingleLink] "${field.field_name}" 原始值:`, JSON.stringify(value));
      
      let recordIds: string[] = [];
      
      if (value && typeof value === 'object' && 'link_record_ids' in value) {
        const linkValue = value as { link_record_ids?: string[] };
        recordIds = linkValue.link_record_ids || [];
      } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string' && (value[0] as string).startsWith('rec')) {
        recordIds = value as string[];
      } else if (typeof value === 'string' && value.startsWith('rec')) {
        recordIds = [value];
      }
      
      if (recordIds.length > 0) {
        // 关联库存表而非设备表
        const inventoryTableId = store.tables.inventory;
        console.log(`[SingleLink] 字段="${field.field_name}", inventoryTableId=${inventoryTableId}, recordIds=${JSON.stringify(recordIds)}, base_token=${store.base_token.substring(0, 10)}...`);
        
        const displayItems: Array<{ text: string; record_ids: string[] }> = [];
        for (const recordId of recordIds) {
          try {
            console.log(`[SingleLink] 调用getBitableRecord: tableId=${inventoryTableId}, recordId=${recordId}`);
            const linkedRecord = await getBitableRecord(store.base_token, inventoryTableId, recordId);
            console.log(`[SingleLink] 成功获取记录, keys=${Object.keys(linkedRecord).join(', ')}`);
            console.log(`[SingleLink] linkedRecord content:`, JSON.stringify(linkedRecord));
            // 尝试多个可能的SN字段名
            const snValue = linkedRecord['SN编码'] || linkedRecord['SN'] || linkedRecord['sn'] || 
                           linkedRecord['SN编码（最最重要）'] || linkedRecord['_record_id'];
            let text = recordId;
            if (snValue !== null && snValue !== undefined) {
              if (Array.isArray(snValue)) {
                text = snValue.map(v => String(v)).join(", ");
              } else {
                text = String(snValue);
              }
            }
            console.log(`[SingleLink] SN值: ${text}`);
            displayItems.push({ text, record_ids: [recordId] });
          } catch (e) {
            console.error(`[SingleLink] 获取关联记录失败: inventoryTableId=${inventoryTableId}, recordId=${recordId}, error=${e}`);
            displayItems.push({ text: recordId, record_ids: [recordId] });
          }
        }
        formatted[field.field_name] = displayItems;
      } else {
        formatted[field.field_name] = [];
      }
    } else {
      // 非lookup/SingleLink字段，使用原有格式化逻辑
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
  console.log(`[GET /api/base] store=${storeId}, table=${tableName}, mode=${searchMode}, field=${searchField}, value=${searchValue}, pageToken=${pageToken}`);

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
    
    // 调试日志：打印设备表的字段信息
    console.log(`[lookup] 设备表字段列表 (共${deviceFields.length}个):`);
    for (const f of deviceFields.slice(0, 10)) {
      console.log(`[lookup]   - "${f.field_name}": id=${f.field_id}, type=${f.type}`);
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

        // 调试日志：打印API返回的字段名和lookup值
        console.log(`[高级搜索] 命中 ${searchResult.items.length} 条记录`);
        if (searchResult.items.length > 0) {
          const firstItem = searchResult.items[0];
          const fieldNames = Object.keys(firstItem);
          console.log(`[高级搜索] 字段列表: ${fieldNames.join(', ')}`);
          // 打印SN编码字段的原始值
          const snField = fieldNames.find(f => f.includes('SN'));
          if (snField) {
            console.log(`[高级搜索] SN字段 "${snField}" 原始值:`, JSON.stringify(firstItem[snField]));
          }
        }
        
        // 使用异步格式化函数处理所有字段（包括lookup）
        const storeConfig = { base_token: store.base_token, tables: store.tables };
        allItems = await Promise.all(
          searchResult.items.map((item: Record<string, unknown>) => 
            formatRecordAsync(item, fields, storeConfig, deviceOptionsByFieldId, deviceFields)
          )
        );
        
        // 调试日志：打印格式化后的lookup值
        if (allItems.length > 0) {
          const firstItem = allItems[0];
          const snField = Object.keys(firstItem).find(f => f.includes('SN'));
          if (snField) {
            console.log(`[高级搜索] SN字段 "${snField}" 格式化后值:`, JSON.stringify(firstItem[snField]));
          }
        }

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
