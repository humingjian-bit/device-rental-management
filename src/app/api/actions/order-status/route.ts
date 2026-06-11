import { NextRequest, NextResponse } from "next/server";
import { getStoreConfig } from "@/lib/config";
import { listBitableRecords, updateBitableRecord } from "@/lib/feishu";

/**
 * POST /api/actions/order-status
 * 订单状态变更 + 库存联动
 *
 * Body: {
 *   store: string,
 *   record_id: string,
 *   new_status: string,       // 新的订单状态值
 *   sn_code: string,          // SN编码，用于查找对应库存记录
 *   return_warehouse?: string // 归还仓库（订单归还时使用）
 * }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { store: storeId, record_id, new_status, sn_code, return_warehouse } = body;

  if (!storeId || !record_id || !sn_code) {
    return NextResponse.json(
      { error: "Missing required fields: store, record_id, sn_code" },
      { status: 400 }
    );
  }

  const store = getStoreConfig(storeId);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // 1. 更新订单状态
  const orderFields: Record<string, unknown> = {
    订单状态: new_status || null, // 空值 = 进行中
  };

  try {
    const updatedOrder = await updateBitableRecord(
      store.base_token,
      store.tables.order,
      record_id,
      orderFields
    );

    // 2. 联动：更新库存状态
    const inventoryStatus = getInventoryStatusFromOrder(new_status, return_warehouse || store.default_warehouse);
    
    if (inventoryStatus !== null) {
      // 查找对应 SN 的库存记录
      const filter = `CurrentValue.[SN编码] = "${sn_code}"`;
      const inventoryRecords = await listBitableRecords(
        store.base_token,
        store.tables.inventory,
        { filter, page_size: 1 }
      );

      if (inventoryRecords.items.length > 0) {
        const inventoryRecord = inventoryRecords.items[0];
        const inventoryRecordId = String(inventoryRecord._record_id);

        // 库存状态是 multiple select，前端按单选处理：替换
        await updateBitableRecord(store.base_token, store.tables.inventory, inventoryRecordId, {
          库存状态: [inventoryStatus],
        });
      }
    }

    return NextResponse.json({
      order: updatedOrder,
      inventory_updated: inventoryStatus !== null,
    });
  } catch (error) {
    console.error("Order status update failed:", error);
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    );
  }
}

/**
 * 根据订单状态确定库存状态
 * 联动规则：
 * - 已完结 → 对应仓库（归还）
 * - 退款 → 对应仓库（归还）
 * - 逾期 → 出租（仍在出租状态）
 * - 取消 → 对应仓库（未发货则归仓）
 * - 进行中/空值 → 出租
 */
function getInventoryStatusFromOrder(orderStatus: string, warehouse: string): string | null {
  switch (orderStatus) {
    case "已完结":
    case "退款":
    case "取消":
      return warehouse; // 对应仓库
    case "逾期":
      return "出租";
    case "":
    case "进行中":
      return "出租";
    default:
      return null; // 不需要联动
  }
}
