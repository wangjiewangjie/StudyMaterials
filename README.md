# 学习资料（StudyMaterials）

本地视频资料库：多源站抓取、本机存储、网页 / Electron 桌面浏览与播放。数据只保存在你自己的电脑上，不依赖云端账号。

## 功能一览

- 浏览已抓取内容：标签筛选、本地搜索、详情页播放（含加密 m3u8）
- 一键同步最新列表；支持关键词按需抓取
- 收藏（同步不会清空）、源站增删与启用/禁用（页面可改）
- 桌面端顶栏 **扫码**：同一 Wi‑Fi 下手机直接打开局域网地址

---

## 架构

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Electron 壳 │────▶│ Express server.js│────▶│ crawler.js  │
│ 或 npm start│     │ API / 静态 / 代理 │     │ 多站抓取    │
└─────────────┘     └────────┬─────────┘     └─────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         React 前端     DATA_DIR 数据    手机扫码访问
       (public/build)   (index/收藏/站)   (同一局域网)
```

| 模块 | 路径 | 职责 |
|------|------|------|
| 服务 | `server.js` | 静态页、REST、HLS/图片代理、触发同步；监听 `0.0.0.0` |
| 爬虫 | `crawler.js` | 列表/关键词抓取、详情解析；永久页 failover 依赖本机 Chrome/Edge |
| 路径 | `lib/paths.js` | `APP_ROOT`（只读）与 `DATA_DIR`（可写） |
| 桌面 | `electron/main.js` | 单实例、注入路径、启停服务、加载本机窗口 |
| 前端 | `frontend/` | React + Ant Design；构建产物在 `public/build/` |

**数据目录**

| 运行方式 | `DATA_DIR` |
|----------|------------|
| `npm start` / 开发 | 项目下 `output/` |
| Electron 安装包 | `%APPDATA%\学习资料\output\`（卸载不会自动删数据） |

---

## 环境要求

- **Node.js** 18+（最低 16）
- Windows 为主；Mac / Linux 命令类似
- 永久地址自动切换需要本机已安装 **Chrome 或 Edge**

验证：

```bash
node -v
npm -v
```

---

## 快速开始（命令行）

### 1. 获取代码

```bash
git clone https://github.com/wangjiewangjie/StudyMaterials.git
cd StudyMaterials
```

或下载 ZIP 解压后进入项目根目录（能看到 `package.json`、`server.js`）。

### 2. 安装依赖

```bash
npm install
```

会安装后端依赖，并自动安装 `frontend/` 依赖。若前端失败：

```bash
cd frontend && npm install && cd ..
```

### 3. 启动

```bash
npm start
```

终端会打印本机与局域网地址，例如：

```text
学习资料已启动
本机  http://localhost:9999
局域网  http://192.168.x.x:9999
```

浏览器打开本机地址即可。默认端口 `9999`，占用时自动递增；也可：

```bash
# PowerShell
$env:PORT=8080; npm start
```

停止：在运行窗口按 `Ctrl + C`。

---

## 桌面端（Electron）

无需对外暴露「用户装 Node」时，开发者可打包 Windows 安装包 / 绿色版。

本地先验证窗口：

```bash
npm run build
npm run electron
```

正式打包（国内建议先设镜像）：

```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
npm install
npm run dist
```

产物在 `dist-electron/`：

| 文件 | 说明 |
|------|------|
| `学习资料 Setup x.x.x.exe` | 安装版（开始菜单 + 桌面快捷方式） |
| `学习资料 x.x.x.exe` | 绿色便携版 |

打包前会跑 `npm run icons`（由 `frontend/public/logo.svg` 生成图标）。若出现 winCodeSign / 符号链接权限错误：打开 Windows「开发人员模式」，或保持 `package.json` 中 `build.win.signAndEditExecutable` 为 `false`。

---

## 手机扫码访问

桌面端或 `npm start` 运行后，服务监听局域网。

1. 电脑与手机连 **同一 Wi‑Fi**
2. 顶栏点 **扫码**（手机侧栏也有入口）
3. 用系统相机或浏览器扫二维码打开

也可手动在手机浏览器输入终端打印的 `http://192.168.x.x:端口`。

打不开时优先检查：

- 是否同一局域网（访客网络 / AP 隔离会导致失败）
- Windows 防火墙是否放行 Node /「学习资料」入站
- 多网卡时在扫码弹窗里切换地址（优先展示 `192.168.*`）

关闭 Electron / 停止 `npm start` 后，手机将无法继续访问。

---

## 日常使用

| 需求 | 操作 |
|------|------|
| 播放 | 首页点卡片 → 详情播放 |
| 标签筛选 | 顶部标签栏 |
| 本地搜索 | 顶栏搜索框 |
| 同步最新 | 顶栏「同步」 |
| 关键词抓取 | 「同步中心 / 日志」 |
| 收藏 | 卡片或详情星标 |
| 管理源站 | 同步中心编辑站点 |
| 手机打开 | 顶栏「扫码」 |
| 数据目录 / 备份 / 清缓存 | 同步中心底部「数据与备份」 |
| 关窗到托盘 | 点关闭隐藏到托盘，同步可继续；托盘右键「退出」才停服 |

### 播放快捷键

| 操作 | 方式 |
|------|------|
| 播放 / 暂停 | 点击画面，或 `空格` / `K` |
| 快退 / 快进 5 秒 | `←` / `→` |
| 音量 | `↑` / `↓` |
| 静音 | `M` |
| 全屏 | `F` 或双击画面 |
| 续播 | 自动记进度，播完清除 |

---

## 开发

仓库已带 `public/build`；仅改 `frontend/` 时需要重新构建：

```bash
npm run build
```

热更新（两个终端）：

```bash
# 终端 1
npm start

# 终端 2
npm run dev
```

浏览器打开 http://localhost:5173 （已代理 API 到后端）。

---

## 命令行爬取

不打开网页也可抓取：

```bash
npm run crawl -- --pages 1
npm run crawl -- --pages 1-5
npm run crawl -- --search 关键词 --search-pages 2
npm run crawl -- --pages 1-5 --limit 20
```

| 参数 | 含义 | 默认 |
|------|------|------|
| `--pages <N\|N-M>` | 列表页范围 | `1` |
| `--search <关键词>` | 搜索模式 | 无 |
| `--search-pages <N>` | 搜索结果页数 | `1` |
| `--limit <N>` | 最多处理条数（0=不限制） | `0` |
| `--concurrency <N>` | 详情页并发 | `6` |

---

## 站点与数据文件

站点保存在 `DATA_DIR/sites.json`，也可在页面「同步中心」修改，保存后下次抓取立即生效。

| 字段 | 含义 |
|------|------|
| `url` | 站点根地址（必填） |
| `name` | 显示名称 |
| `todayPath` | 「今日」分类路径；空则抓列表第 1 页 |
| `archiveSuffix` | 详情后缀：`/` 或 `.html` |
| `enabled` | 是否参与抓取 |
| `permanentUrl` | 可选；域名失效时用永久页解析新线路 |

| 文件 | 内容 |
|------|------|
| `index.json` | 视频列表索引（轻量，不含正文/图集） |
| `details/` | 详情分文件（`content` / `images` / `blocks`，按 id） |
| `favorites.json` | 收藏 |
| `sites.json` | 站点配置 |
| `watch-progress.json` | 播放进度（桌面/网页共用，落在数据目录） |
| `fixed-tags.json` | 高频固定标签 |
| `.server-port` | 当前实际监听端口 |
| `sync-log.json` | 当前会话同步日志 |
| `sync-logs/` | 历史会话归档（默认保留 7 天） |
| `media-cache/` | 封面/图集缓存（可在同步中心清除） |

---

## 命令速查

| 命令 | 作用 |
|------|------|
| `npm install` | 安装依赖（含前端） |
| `npm start` | 启动服务 |
| `npm run electron` | 桌面窗口（需已 build 前端） |
| `npm run dist` | 打包 Windows 安装包 + 绿色版 |
| `npm run build` | 构建前端到 `public/build` |
| `npm run dev` | 前端热更新 |
| `npm run crawl -- …` | 命令行爬取 |
| `npm run icons` | 从 logo 生成桌面图标 |

---

## 常见问题

**端口被占用**  
程序会自动换端口；或用环境变量 `PORT` 指定。实际端口见终端输出或 `DATA_DIR/.server-port`。

**手机扫码打不开**  
确认同 Wi‑Fi、防火墙放行、扫码弹窗选对网卡 IP；关掉桌面端后服务即停。

**永久地址切换失败**  
需本机 Chrome/Edge；也可设 `PUPPETEER_EXECUTABLE_PATH` 指向浏览器可执行文件。

**前端改了没变化**  
执行 `npm run build` 后再 `npm start` / 重新打开 Electron。

**打包报符号链接 / 签名相关错误**  
开启 Windows 开发人员模式，或保持不签名配置（见上文打包说明）。
