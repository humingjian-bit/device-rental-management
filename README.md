# 设备租赁管理系统

基于 Next.js 14 + MUI + 飞书多维表的设备租赁管理系统。

## 技术栈

- **框架**: Next.js 14 (App Router)
- **UI**: MUI v5 + @emotion
- **语言**: TypeScript
- **数据源**: 飞书多维表 (Bitable API)
- **状态管理**: SWR
- **配置**: YAML

## 项目结构

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── auth/                 # 认证（OAuth/Session）
│   │   ├── base/[store]/[table]/ # 数据表 CRUD 代理
│   │   ├── actions/              # 业务动作（订单-库存联动）
│   │   └── config/               # 配置
│   ├── device/                   # 设备管理页面
│   ├── inventory/                # 库存管理页面
│   ├── order/                    # 订单管理页面
│   ├── repair/                   # 维修管理页面
│   └── login/                    # 登录页面
├── components/
│   ├── AppLayout.tsx             # 侧边栏布局
│   ├── DataTable/                # 通用数据表格（CRUD）
│   └── SNSearch/                 # SN编码搜索选择器
├── hooks/
│   ├── useStore.ts               # 店铺切换 + 认证
│   └── useTableData.ts           # 通用表格数据
├── lib/
│   ├── auth/                     # 认证工具
│   ├── config/                   # YAML 配置加载
│   └── feishu/                   # 飞书 API 封装
└── config/
    └── stores.yaml               # 店铺配置
```

## 快速开始

1. 安装依赖:
```bash
npm install
```

2. 配置环境变量:
```bash
cp .env.example .env.local
# 编辑 .env.local 填入 FEISHU_APP_SECRET
```

3. 启动开发服务器:
```bash
npm run dev
```

4. 访问 http://localhost:3000

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| FEISHU_APP_SECRET | 飞书应用密钥 | ✅ |
| FEISHU_REDIRECT_URI | OAuth 回调地址 | ✅ |
| NEXT_PUBLIC_APP_URL | 应用 URL | ❌ |

## 飞书配置

1. 在飞书开放平台创建应用
2. 开启网页应用能力
3. 配置重定向 URL
4. 将应用添加为多维表协作者
5. 将 App ID 和 App Secret 配置到环境变量

## 核心功能

- 飞书 OAuth 登录
- 多店铺切换
- 设备/库存/订单/维修 CRUD
- 订单状态 → 库存状态联动
- 今日运营指标
- SN编码搜索选择
- 状态动态读取（不硬编码）
