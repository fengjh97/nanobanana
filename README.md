# 静闻的光影花园 · nanobanana

纯前端版本，可直接部署到 GitHub Pages。Google Gemini API key 由用户自己提供（BYOK），保存在浏览器 `localStorage`，**不会进入仓库或服务器**。

## 文件结构

```
.
├── index.html          入口页面
├── static/
│   ├── app_v2.js       主逻辑 + Gemini API 调用
│   ├── styles.css      样式
│   ├── logo.png
│   └── favicon.svg
├── .nojekyll           告诉 GitHub Pages 不要走 Jekyll 处理
└── README.md
```

## 部署到 GitHub Pages

1. 把当前分支合并/推到 `main`。
2. 进入仓库 → **Settings → Pages**。
3. **Source** 选 `Deploy from a branch`，**Branch** 选 `main`、目录 `/ (root)`，保存。
4. 等待 1–2 分钟，访问 `https://<你的用户名>.github.io/nanobanana/`。

## 第一次使用

1. 到 [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) 创建一个免费 API key（需要登录 Google 账号）。
2. 打开站点，右上角点 **⚙ 设置 API Key**，粘贴 key，点保存。
3. 上传图片 + 写提示词 → 生成。

> Key 只保存在你这台浏览器的 `localStorage`，仅用于浏览器直接调用 `generativelanguage.googleapis.com`。换浏览器/清缓存后需要重新输入。

## 本地预览

任意静态服务器即可：

```bash
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

## 用到的模型

- `gemini-3-pro-image-preview`（图像生成 / 图像编辑）
- 输入：1 张原图（单张模式）或 2 张图（风格模仿模式）+ 文本提示词
- 输出：base64 PNG，直接显示在结果区
