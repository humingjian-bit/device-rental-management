/**
 * 平台解析器注册表
 */

import { RenrenzuParser } from "./renrenzu";
import { SyncOrder } from "../sync/types";

/**
 * 解析器基类
 */
export interface Parser {
  /**
   * 解析文件内容
   * @param content 文件内容
   * @returns 订单列表
   */
  parse(content: string): SyncOrder[];
}

/**
 * 获取解析器实例
 */
export function getParser(platformId: string): Parser | null {
  switch (platformId) {
    case "renrenzu":
      return new RenrenzuParser();
    // 其他平台后续添加
    // case "huizu":
    //   return new HuizuParser();
    default:
      return null;
  }
}
