# 西泽博客最终改造记录

更新时间：2026-05-15

本文档用于完整记录当前博客项目的最终改造状态，方便后续继续维护、交接、回看和二次开发。

## 1. 项目当前定位

当前项目已经从默认的 Firefly 示例博客，改造成了一个属于你自己的个人博客站点，核心特点如下：

- 博客名称：`西泽`
- 导航栏标题：`xize`
- 主要视觉风格：透明卡片 + 大背景图
- 头像：使用你提供的人物头像
- 导航栏 Logo：使用同一张头像图作为站点 Logo
- 音乐播放器：已切换为你的网易云歌单
- 后台管理：已接入 `/admin/` 管理后台
- 线上部署：Cloudflare Worker + 静态资源
- 实时内容更新：已实现“线上后台保存后，公开博客页自动轮询刷新内容”

## 2. 当前线上地址

- 主站：`https://xize.ink/`
- 后台：`https://xize.ink/admin/`
- 健康检查：`https://xize.ink/api/health`
- 实时内容状态：`https://xize.ink/api/live/status`

## 3. 当前整体架构

当前项目不是传统数据库博客，而是“静态站外壳 + Worker 内容层”的混合结构。

### 3.1 前台

前台仍然使用 Astro 构建页面骨架和大部分样式。

保留内容：

- 首页
- 文章页
- 归档页
- 搜索页
- 留言页
- 相册页
- 友链页
- RSS

### 3.2 后台

后台页面位于：

- `public/admin/index.html`
- `public/admin/app.js`
- `public/admin/app.css`

后台 API 由 Cloudflare Worker 提供：

- `worker/index.js`

### 3.3 内容来源

当前线上实时内容来源是：

- `GitHub 仓库 master 分支`

也就是说：

- 后台保存文章时，Worker 直接调用 GitHub API 修改仓库里的 Markdown 文件
- 前台运行时通过 Worker API 拉取最新内容
- 所以不需要等静态站重新构建，也能在页面上看到新的文章内容

### 3.4 D1 状态

代码里已经预留了 D1 实时内容层支持，包含：

- `worker/schema.sql`
- `worker/index.js` 里的 D1 逻辑

但目前线上还没有正式绑定 D1 数据库，原因是之前使用的 Cloudflare API Token 没有 D1 创建权限。

所以当前真实生效模式是：

- `storage: "github"`

而不是：

- `storage: "d1"`

这不影响你现在使用线上实时更新，只是后续如果你想让实时层更稳定、更快，可以再补 D1 权限后升级。

## 4. 已完成的视觉改造

### 4.1 站点基础信息

主要配置文件：

- `src/config/siteConfig.ts`
- `src/config/profileConfig.ts`
- `src/config/backgroundWallpaper.ts`

当前已经完成：

- 站点标题改为 `西泽`
- 副标题改为 `xize`
- 个人名称改为 `淅泽`
- 个性签名改为：
  `当时年少掷春光，花马踏蹄酒溅香。`

### 4.2 背景图

当前背景图来自你自己的图片资源，已放入：

- `src/assets/images/MyWallpaper/`

当前背景模式默认值：

- `overlay`

也就是全屏背景透明叠加模式。

效果是：

- 打开站点就是全屏背景
- 卡片有透明度
- 顶栏也跟背景融合
- 页面整体不再是默认示例站风格

### 4.3 头像

当前头像文件：

- `src/assets/images/avatar-custom.webp`

用于：

- 侧边栏头像
- 站点 Logo 源图

### 4.4 导航栏 Logo

当前导航栏 Logo 已替换为你的头像图。

相关文件：

- `src/config/siteConfig.ts`
- `src/components/layout/Navbar.astro`

当前浏览器 favicon 也同步替换为头像缩略图：

- `public/favicon/logo-avatar.png`

### 4.5 音乐歌单

音乐配置文件：

- `src/config/musicConfig.ts`

当前已切换为你的网易云歌单：

- 平台：`netease`
- 类型：`playlist`
- 歌单 ID：`13912850386`

## 5. 已完成的内容清理

原项目自带了大量示例文章。

当前已经做过的处理：

- 示例文章仍保留在仓库中
- 但默认前台不再把它们当成你的公开文章展示
- 多篇示例文已改为 `draft: true`

这样处理的优点：

- 你以后仍能参考这些模板内容
- 但站点访客不会误以为这些示例文章是你的正式内容

## 6. 当前后台能力

### 6.1 后台地址

线上后台：

- `https://xize.ink/admin/`

本地后台：

- `http://127.0.0.1:8787/admin/`

### 6.2 登录方式

后台通过 `ADMIN_TOKEN` 进行认证。

注意：

- 文档里不记录真实密码
- 真实密码应只放在 Cloudflare Secret 或本地 `.env`

### 6.3 当前支持的管理能力

目前后台支持：

- 查看文章列表
- 查看草稿和已发布文章
- 搜索标题、分类、标签、slug
- 新建文章
- 编辑文章 frontmatter
- 编辑 Markdown 正文
- 上传封面图并自动回填图片地址
- 保存草稿
- 发布文章
- 删除文章

### 6.4 后台改文后的实际流程

当前线上后台不是直接改服务器文件，而是：

1. 后台提交内容到 Worker
2. Worker 验证 `ADMIN_TOKEN`
3. Worker 调用 GitHub API 修改仓库里的 Markdown
4. 前台页面通过实时 API 轮询拿到新内容

也就是说，当前已经实现了：

- 后台保存后，公开站点可自动看到变化

### 6.5 图片上传能力

当前后台已经支持“封面图上传”。

实现方式：

- 后台选择图片文件
- Worker 接收上传请求
- 如果未来绑定了 R2，则优先写入 R2
- 如果没有 R2，则自动回退到 GitHub 仓库中的 `public/uploads/`
- Worker 返回统一图片地址：
  `/media/...`

当前线上实际生效模式：

- `storage: github`

也就是说：

- 上传的图片现在会提交进 GitHub 仓库
- 但访问时通过 Worker 的 `/media/...` 路由立即对外提供
- 不需要等下一次静态构建完成，封面图也能马上打开

当前 Worker 图片接口：

- 上传接口：`POST /api/media/upload`
- 访问接口：`GET /media/...`

### 6.6 本地图片上传能力

本地后台也支持图片上传。

当前本地逻辑：

- 本地后台上传图片时，文件写入 `public/uploads/`
- 前台本地开发服务器会直接读取这些文件
- 所以本地联调和线上后台体验基本一致

## 7. 当前实时更新能力

这是本次改造最关键的一部分。

### 7.1 已实现的实时能力

当前已经实现：

- 首页文章流运行时拉取最新文章
- 文章详情页主内容运行时拉取最新文章正文
- 归档页运行时拉取最新文章列表
- `/api/allPostMeta.json` 由 Worker 动态返回最新元数据

### 7.2 轮询机制

当前实时轮询间隔：

- `15000ms`

也就是约 15 秒。

对应接口：

- `/api/live/status`
- `/api/live/posts`
- `/api/live/posts/:slug`

### 7.3 为什么不是“完全无刷新秒变”

当前实现的是：

- 页面打开后自动轮询刷新内容

不是：

- WebSocket
- Server-Sent Events
- 页面完全无感瞬时推送

原因是现在这套改法是在尽量保留原 Astro 结构的前提下完成的，成本更低，兼容性也更好。

### 7.4 当前剩余的非实时部分

目前仍然主要依赖构建结果、暂未完全改成实时的部分包括：

- Pagefind 搜索索引
- 某些构建期统计
- 部分推荐内容与分类数量展示
- 纯静态页面中的部分摘要块

换句话说：

- “文章内容更新”已经基本实时
- “搜索索引 / 某些统计附属内容”还不是实时

## 8. 当前已做的稳定性修复

### 8.1 后台登录状态文案修复

之前后台容易出现：

- 实际没认证成功
- 但页面又像“已经进去了”

现在已区分为三种状态：

- `未登录`
- `Token 已填入，待验证`
- `认证成功`

对应文件：

- `public/admin/app.js`

### 8.2 首页文章抖动修复

之前首页点击分类栏“主页”等按钮时，文章区域容易反复抖动。

已经做的修复：

- 当前链接点击时不重复触发导航
- 实时轮询只有内容真正变化时才重绘文章列表

对应文件：

- `src/components/layout/CategoryBar.astro`
- `src/components/features/LiveHomeSync.astro`

## 9. 本地开发方式

### 9.1 只开前台

```bash
pnpm dev
```

地址：

- `http://127.0.0.1:4321/`

### 9.2 只开本地后台

```bash
pnpm admin
```

地址：

- `http://127.0.0.1:8787/admin/`

### 9.3 前后联调

```bash
pnpm dev:admin
```

这会同时启动：

- Astro 前台
- 本地内容后台

当前本地联调逻辑是：

- 后台直接改 `src/content/posts`
- 前台本地热更新立刻生效

## 10. 当前部署方式

### 10.1 Cloudflare Worker 配置

配置文件：

- `wrangler.toml`

当前部署方式是：

- Worker 主脚本：`worker/index.js`
- 静态资源目录：`dist`

### 10.2 构建命令

```bash
pnpm build
```

### 10.3 部署命令

```bash
pnpm exec wrangler deploy
```

或者：

```bash
pnpm deploy:worker
```

### 10.4 Cloudflare 线上密钥

当前应该放在 Cloudflare Secret 中的内容：

- `ADMIN_TOKEN`
- `GITHUB_TOKEN`

不要把真实值写进：

- 仓库源码
- 文档
- 公开截图

## 11. 当前重要文件索引

### 11.1 站点基础配置

- `src/config/siteConfig.ts`
- `src/config/profileConfig.ts`
- `src/config/backgroundWallpaper.ts`
- `src/config/musicConfig.ts`
- `src/config/navBarConfig.ts`
- `src/config/sidebarConfig.ts`

### 11.2 内容与文章

- `src/content/posts/`

### 11.3 前台关键逻辑

- `src/components/layout/Navbar.astro`
- `src/components/layout/PostPage.astro`
- `src/pages/[...page].astro`
- `src/pages/posts/[...slug].astro`
- `src/pages/archive.astro`
- `src/components/controls/ArchivePanel.svelte`
- `src/components/layout/CategoryBar.astro`

### 11.4 实时同步相关

- `src/components/features/LiveHomeSync.astro`
- `src/components/features/LivePostSync.astro`
- `src/pages/live-post-shell.astro`
- `worker/index.js`
- `worker/schema.sql`

### 11.5 后台相关

- `public/admin/index.html`
- `public/admin/app.js`
- `public/admin/app.css`
- `scripts/admin-server.js`
- `scripts/dev-with-admin.js`

## 12. 当前 Git 里程碑

项目最近关键提交包括：

- `8887021` `feat: add worker admin and personalize blog`
- `fb8cf6b` `feat: add live blog sync on worker`
- `dbffc56` `fix: clarify admin auth state and reduce homepage jitter`
- `7d49f6c` `feat: use profile image as site logo`

这些提交基本对应了：

- 站点个性化改造
- 后台接入
- 线上实时联调
- 登录状态修复
- 首页抖动修复
- Logo 替换

## 13. 当前最终成果总结

现在这个博客已经不再是最初的 Firefly 示例站，而是一个具备以下能力的个人博客：

- 有你自己的名称、头像、背景和风格
- 有自己的音乐歌单
- 有可用的线上后台
- 后台支持封面图上传
- 有本地前后联调能力
- 有线上准实时内容同步能力
- 有 GitHub 内容备份链路
- 有 Cloudflare Worker 线上部署链路

它现在已经足够作为正式个人站点长期使用。

## 14. 后续建议

如果继续升级，建议按这个顺序走：

1. 绑定 D1
   这样实时内容层会从 GitHub 读取升级为数据库读取，速度更稳。

2. 搜索实时化
   把 Pagefind 依赖降下去，改成 Worker API 搜索。

3. 分类/统计完全实时化
   当前还有少量构建期统计未实时。

4. 评论系统正式接入
   推荐 `giscus` 或者你后续喜欢的评论方案。

5. 正文图片上传增强
   现在已支持封面图上传，但正文区还没有“插入图片按钮”和图库管理。

## 15. 一句话结论

当前博客已经完成从“静态示例模板”到“可上线、可后台管理、可线上准实时更新的个人博客”的改造。
