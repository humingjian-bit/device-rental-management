# 待修复清单（2026-06-28）

## 1. 人人租默认"南通月结" [P1]
- 文件：renrenzu.ts
- 改法：parseRow 中加 `express_settlement: "南通月结"`

## 2. 惠租补充续租逻辑 [P1]
- 文件：huizu.ts
- 目前惠租只取"结束日期"+3天，没有续租处理
- 需要看惠租xlsx是否有续租相关字段（总期数？总租用天数？）

## 3. 长租过滤统一到引擎层 [P2]
- 去掉解析器里的长租过滤（重复），保留引擎统一过滤+日志
- 文件：engine.ts, renrenzu.ts, huizu.ts

## 4. 人人租去掉库存联动 [P1]
- 两个平台CSV都没有SN编码，库存联动无意义
- 引擎中跳过库存联动步骤
- 两个平台的日志中不应出现"开始库存联动"等字样
- 文件：engine.ts

## 5. 前端环境标识横幅 [P1]
- 当前双目录部署方式，需要确认测试环境构建时是否注入了 NEXT_PUBLIC_APP_ENV=test
- 如果没有注入，需要在测试环境构建时加上
- 文件：AppLayout.tsx（已有横幅逻辑），需要小夏在测试环境 .env 里加 NEXT_PUBLIC_APP_ENV=test

## 6. 清理 config/index.ts 冗余的环境切换逻辑 [P2]
- 当前部署是双目录各自独立 config/stores.yaml
- config/index.ts 里的 APP_ENV 切换 stores.yaml/stores.test.yaml 逻辑不再需要
- 简化为直接读取 config/stores.yaml
- 可删除 stores.test.yaml
