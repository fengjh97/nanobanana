# 静闻的光影花园 · nanobanana

Cloudflare Pages 版本：4 位 PIN 登录 + 服务端锁定 + Gemini 调用走 Pages Functions（API key 永远不下发到浏览器）。

## 架构

```
浏览器 ──── PIN ────► /api/login (Pages Function)
                       │
                       │ 验 PIN，KV 计数，错 10 次锁 30 分钟
                       │ 通过则签 HMAC token (12h)
                       ▼
浏览器 ◄── token ──────┘
浏览器 ──── token + image + prompt ────► /api/generate (Pages Function)
                                         │
                                         │ 验 token
                                         │ 用 GEMINI_API_KEY 调 generativelanguage.googleapis.com
                                         ▼
浏览器 ◄── 生成的图片 ──────────────────┘
```

仓库里**没有任何明文 / 密文 key**。`GEMINI_API_KEY`、`PIN`、`TOKEN_SECRET` 都是 Cloudflare Pages 的环境变量，只在边缘 Function 里能读到。

## 文件结构

```
.
├── index.html
├── static/
│   ├── app_v2.js          登录 + 调用 /api/* 的前端逻辑
│   ├── styles.css
│   ├── logo.png
│   └── favicon.svg
├── functions/             Cloudflare Pages Functions
│   ├── _shared.js         token 签名/验证、锁定 KV、JSON 响应
│   └── api/
│       ├── login.js       POST /api/login → 验 PIN，签 token
│       └── generate.js    POST /api/generate → 验 token，转发 Gemini
├── .nojekyll
└── README.md
```

## 部署到 Cloudflare Pages（首次）

1. 登录 https://dash.cloudflare.com
2. **Workers & Pages → Create → Pages → Connect to Git**
3. 选 `fengjh97/nanobanana`，分支选 `main`
4. Build settings：
   - Framework preset: `None`
   - Build command: 留空
   - Build output directory: `/`
5. **Save and Deploy**（第一次会失败或部分功能不可用，因为环境变量还没配）

### 配置环境变量 + KV

在 Pages 项目的 **Settings → Environment variables** 加：

| 变量 | 值 |
|---|---|
| `GEMINI_API_KEY` | 你的 Google AI Studio key |
| `PIN` | 你想要的 4 位数字（比如 `1234`） |
| `TOKEN_SECRET` | 任意 32+ 位随机字符串 |

在 **Workers & Pages → KV** 创建一个 namespace 叫 `nanobanana_lockout`，然后到 Pages 项目的 **Settings → Functions → KV namespace bindings** 绑定：

| Variable name | KV namespace |
|---|---|
| `LOCKOUT_KV` | `nanobanana_lockout` |

绑完触发一次 redeploy（push 任意小改动，或在 Deployments 里 Retry）。

## 锁定策略

- 错 10 次 PIN → 423 Locked，30 分钟后自动解锁
- 锁定状态存 KV，单 key `login_state`
- 30 分钟无错误自然失效（KV TTL）

## Token 失效

- HMAC-SHA256 签名，TTL 12 小时
- 过期或被篡改 → /api/generate 返回 401 → 前端自动清 localStorage 重新登录

## 本地开发（可选）

```bash
npm i -g wrangler
wrangler pages dev . --kv LOCKOUT_KV --binding GEMINI_API_KEY=xxx --binding PIN=1234 --binding TOKEN_SECRET=yyy
```
