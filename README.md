# 静闻的光影花园 · nanobanana

纯前端 Gemini 图片编辑站，部署在 GitHub Pages。Google API key 用密码加密后放在仓库里，访问需要先登录。

## 工作原理

- `key.enc.json` = 用密码 PBKDF2-SHA256 (60 万轮) + AES-256-GCM 加密后的 API key
- 主页是登录页，输入密码 → 浏览器本地解密 → 解出来的 key 缓存到 localStorage
- 之后同一浏览器免登录直接进；换浏览器/清缓存只用再输一次密码
- 任何人看仓库源码都只能看到密文，没有密码暴破不出来（密码够强的前提下）

## 部署 / 重新加密

第一次使用 或 想换密码 / 换 key 时：

1. 打开 `https://fengjh97.github.io/nanobanana/setup.html`
2. 输入 Google API key + 密码（**至少 16 位**或长 passphrase）
3. 点"生成密文" → 把生成的 JSON **完整覆盖**到仓库根目录的 `key.enc.json`
4. commit + push → 等 Pages 重建（一两分钟）
5. 访问 `https://fengjh97.github.io/nanobanana/` → 输密码登录

setup 页面所有计算都在浏览器里完成，明文 key 和密码不会通过网络发出。

## 文件结构

```
.
├── index.html           主页（登录后才能用）
├── setup.html           本地生成密文的工具页
├── key.enc.json         加密后的 API key（必须存在主页才能登录）
├── static/
│   ├── app_v2.js        登录 + 解密 + Gemini 调用
│   ├── styles.css
│   ├── logo.png
│   └── favicon.svg
├── .nojekyll
└── README.md
```

## 安全限制

- **密码强度直接决定安全。**密文是公开的，弱密码会被离线暴破。
- 想"撤销"已经登录的设备：只能换密码（重新跑 setup → 覆盖 `key.enc.json`），但已经在别的设备 localStorage 里缓存的 key 仍然能用，直到那台设备清缓存或你自己到 aistudio 吊销 Google key。
- 仓库当前是 public：源码、密文、commit 历史所有人可见。

## 本地预览

```bash
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

## 用到的模型

`gemini-3-pro-image-preview`，浏览器直接调用 `generativelanguage.googleapis.com`。
