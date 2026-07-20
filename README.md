# 学习资料

Node.js 爬虫 + 本地视频库 Web UI —— 爬取 4 个站点的文章元数据与 m3u8 视频地址，提供本地搜索、统一「同步资料」（关键词搜索 / 列表抓取）与 HLS 在线播放。

## 功能特性

- **多站点爬取**：同时爬取 4 个源站（91吃瓜 / 91视频 / 51fans / 51爆料），自动按站点去重
- **今日优先**：列表爬取先抓各站点「今日」；**按站点独立**判断，某站今日为空则回退该站列表第 1 页（前一日）；启动爬取按 `dateModified` 过滤当日/前一日
- **视频地址解析**：从详情页 `.dplayer` 的 `data-config` 中提取真实 m3u8 URL（自动过滤 pre_ads / post_ads）
- **日期抓取**：从详情页 `<meta itemprop="datePublished">` 或 JSON-LD 中解析发布日期
- **内容过滤**：标题或标签含「重口味」「ai」的文章自动筛除
- **索引写入**：服务启动爬取会**整库替换** `index.json`；界面「同步资料」则 **push 合并**（新条目置顶、同 ID 更新、旧条目保留）
- **本地搜索**：按标题或 ID 过滤已爬取的记录
- **同步资料**：同一入口——有关键词则全网搜索同步，无关键词则按页码抓取「今日」+ 列表
- **收藏**：独立 `output/favorites.json`，同步/爬取不会清空；支持下载 JSON 或地址列表
- **HLS 在线播放**：基于 hls.js + 自定义 ProxyLoader，通过 CORS 代理播放带 AES-128 加密、带时效 auth_key 的 m3u8
- **URL 刷新**：播放前自动调用 `/api/refresh/:id` 重新抓取详情页，获取未过期的 m3u8 地址
- **封面按需解密**：封面不落盘，通过 `/api/cover/:id` 实时抓取并内存解密后返回
- **自定义播放器**：自绘控制栏（进度条/缓冲条/音量/倍速/全屏）、键盘快捷键、记忆播放进度
- **深色主题 UI**：金色渐变点缀、毛玻璃头部、卡片悬停动效、响应式布局

## 项目结构

```
Scrape/
├── server.js              # Express 服务器：API + CORS 代理 + 静态资源
├── crawler.js             # 爬虫主模块（crawl / parseDetailPage / loadIndex）
├── imageDecrypt.js        # 源站 AES 加密封面解密（VM 沙箱加载 zzz.js）
├── package.json           # 后端依赖与脚本
├── output/
│   └── index.json         # 文章元数据索引
├── public/
│   └── build/             # React 构建产物（由 Express 静态托管，已预构建）
└── frontend/              # React + Vite 前端源码
    ├── src/
    │   ├── App.jsx        #   主组件（列表 / 搜索 / 爬取面板 / 播放弹窗）
    │   ├── VideoPlayer.jsx#   自定义 HLS 播放器
    │   ├── index.css
    │   └── main.jsx
    ├── vite.config.js     #   构建输出到 ../public/build，开发代理 /api /proxy
    └── package.json
```

## 环境要求

- **Node.js** ≥ 16（推荐 18+）

## 快速开始

仓库已带预构建的前端（`public/build/`），克隆后两条命令即可运行：

```bash
npm install      # 安装后端依赖；postinstall 会自动装好前端依赖
npm start        # 启动服务器，打开 http://localhost:3000
```

> `npm install` 触发的 `postinstall` 会在 `frontend/` 下自动执行一次依赖安装，因此无需手动进入该目录。若前端安装失败，可单独执行：`cd frontend && npm install`。

启动成功会看到：

```
学习资料 - 服务器已启动: http://localhost:3000
已加载 N 条记录
```

服务器启动时会自动后台爬取各站点「今日」内容；若某站今日为空，则单独回退抓取该站列表第 1 页（前一日）。

### 修改端口

```bash
# Windows PowerShell
$env:PORT=8080; npm start

# Windows CMD
set PORT=8080 && npm start

# macOS / Linux
PORT=8080 npm start
```

### 重新构建前端

当修改了 `frontend/` 下的源码后，重新构建一次即可（依赖已由 `npm install` 装好）：

```bash
npm run build     # 等价于在 frontend/ 下执行 vite build，输出到 public/build/
```

### 开发模式（前端热更新）

需要两个终端：

```bash
# 终端 1：后端 API 服务器
npm start

# 终端 2：Vite 前端开发服务器
npm run dev       # 启动在 http://localhost:5173，已配置 /api /proxy 代理到 :3000
```

## npm 脚本一览

| 命令 | 说明 |
|------|------|
| `npm install` | 安装后端依赖，并自动安装前端依赖（postinstall） |
| `npm start` | 启动 Express 服务器（托管 API + 静态前端），默认 :3000 |
| `npm run build` | 重新构建前端到 `public/build/` |
| `npm run dev` | 启动 Vite 前端开发服务器（热更新），默认 :5173 |
| `npm run crawl -- [opts]` | 命令行运行爬虫，参数见下文 |

## 爬虫命令行用法

`crawler.js` 可独立运行，无需启动服务器：

```bash
# 抓取第 1 页
npm run crawl -- --pages 1

# 抓取第 1-5 页
npm run crawl -- --pages 1-5

# 在线搜索关键词并抓取
npm run crawl -- --search 探花 --search-pages 2

# 限制最多处理 20 篇
npm run crawl -- --pages 1-5 --limit 20

# 指定输出目录和并发数
npm run crawl -- --pages 1 --out ./output --concurrency 5
```

**完整参数：**

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--pages <N\|N-M>` | 列表页范围 | `1` |
| `--search <keyword>` | 搜索关键词（覆盖 `--pages`） | - |
| `--search-pages <N>` | 搜索结果页数 | `1` |
| `--limit <N>` | 最多处理文章数（0=全部） | `0` |
| `--out <dir>` | 输出目录 | `./output` |
| `--concurrency <N>` | 详情页并发数 | `3` |
| `--save-json <path>` | 元数据 JSON 路径 | `./output/index.json` |

## 播放器操作

| 操作 | 方式 |
|------|------|
| 播放 / 暂停 | 点击视频，或 `空格` / `K` |
| 快退 / 快进 5 秒 | `←` / `→` |
| 后退 / 前进 10 秒 | 控制栏 ⏪ / ⏩ 按钮 |
| 音量 | `↑` / `↓`，或拖动音量条 |
| 静音 | `M`，或点击音量图标 |
| 倍速（0.5×~2×） | 控制栏倍速菜单 |
| 全屏 | `F`，或双击视频，或点击 ⛶ |
| 定位 | 拖动进度条（含缓冲指示） |
| 续播 | 自动记忆每个视频进度，下次打开续播，播完自动清除 |

## API 接口

服务器启动后提供以下接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/videos` | 获取全部视频列表（可选 `?q=关键词` 本地搜索） |
| GET | `/api/favorites` | 收藏列表（独立 `favorites.json`，不受爬取清空影响） |
| POST | `/api/favorites` | 加入收藏（body 含条目快照） |
| DELETE | `/api/favorites/:id` | 取消收藏 |
| GET | `/api/favorites/download` | 下载收藏（`?format=json` 或 `txt`） |
| GET | `/api/refresh/:id` | 刷新某文章的 m3u8 URL（重新抓取详情页获取未过期地址） |
| GET | `/api/cover/:id` | 实时抓取并解密封面图，内存返回（不落盘） |
| POST | `/api/search-online` | 在线搜索并爬取，body：`{ keyword, pages }` |
| POST | `/api/crawl` | 爬取列表页，body：`{ pageStart, pageEnd }` |
| GET | `/proxy/<enc-url>` | CORS 代理（m3u8 / TS / AES key），URL 需 encodeURIComponent |
| GET | `/*` | SPA 兜底，返回 React `index.html` |

## 数据格式

`output/index.json` 中每条记录字段：

```json
{
  "id": "111056",
  "title": "文章标题",
  "url": "https://bite.ygvttlxzy.cc/archives/111056/",
  "siteUrl": "https://bite.ygvttlxzy.cc",
  "coverUrl": "https://.../cover.jpg",
  "video": { "url": "https://.../index.m3u8?auth_key=...", "type": "hls" },
  "tags": ["标签1", "标签2"],
  "category": "分类名",
  "datePublished": "2026-07-15"
}
```

## 常见问题

**Q：视频播放失败，提示 keyLoadError / 403？**
A：m3u8 URL 中的 `auth_key` 是有时效的。播放器会在播放前自动调用 `/api/refresh/:id` 重新获取最新地址。若仍失败，可能是源站对该视频已下线或更换了 CDN。

**Q：代理返回 502？**
A：源站 CDN 要求 `Referer` 匹配目标 origin。代理已根据目标 URL 自动派生 Referer，如源站策略变更可能需要调整 `server.js` 中的 proxy 实现。

**Q：端口被占用？**
A：用 `PORT=新端口 npm start` 指定其他端口。开发模式下，`frontend/vite.config.js` 中的代理目标默认指向 `:3000`，若后端端口改了需同步修改。

**Q：`npm install` 很慢或卡住？**
A：postinstall 会再装一次前端依赖。如已装好可中断，直接 `npm start`；或用 `npm install --ignore-scripts` 跳过前端依赖，仅手动在 `frontend/` 下安装一次。
