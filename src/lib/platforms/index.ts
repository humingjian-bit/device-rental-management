/**
 * 平台解析器注册表
 */

import { RenrenzuParser } from "./renrenzu";
import { HuizuParser } from "./huizu";
import { SyncOrder } from "../sync/types";

/**
 * 解析器基类
 */
export interface Parser {
  /**
   * 解析文件内容
   * @param content 文件内容（CSV 解析器接收 string，xlsx 解析器接收 Buffer）
   * @returns 订单列表
   */
  parse(content: string | Buffer): SyncOrder[];
}

/**
 * 获取解析器实例
 */
export function getParser(platformId: string): Parser | null {
  switch (platformId) {
    case "renrenzu":
      return new RenrenzuParser();
    case "huizu":
      return new HuizuParser();
    default:
      return null;
  }
}
