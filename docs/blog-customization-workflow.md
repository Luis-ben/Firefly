# Firefly 博客个人化与发布流程知识文档

本文档用于把当前 Firefly 博客改成自己的站点，并整理从本地修改、Obsidian 写作、Git 上传，到 Cloudflare Worker 部署后台的一整套流程。

## 1. 当前项目是什么

当前项目是一个 Astro 静态博客，主题基于 Firefly。核心逻辑是：

- 页面、主题、导航、个人资料等配置放在 `src/config/`
- 文章放在 `src/content/posts/`
- 关于页、友链、留言板等特殊页面内容放在 `src/content/spec/`
- 静态公共资源放在 `public/`
- 需要 Astro 优化的图片放在 `src/assets/images/`
- 本地后台服务放在 `scripts/admin-server.js`
- 线上 Cloudflare Worker 后台放在 `worker/index.js`
- Cloudflare Worker 配置放在 `wrangler.toml`

当前项目已经新增了管理后台相关内容：

- `public/admin/`：后台前端页面
- `scripts/admin-server.js`：本地文章管理 API
- `scripts/dev-with-admin.js`：同时启动博客和后台
- `worker/index.js`：Cloudflare Worker 线上 API
- `docs/backend.md`：本地后台说明
- `docs/cloudflare-worker-admin.md`：Cloudflare Worker 后台说明
- `.env.example`：本地环境变量模板

## 2. 本地开发环境

需要安装：

- Node.js，建议 22
- pnpm，项目指定版本是 `pnpm@9.14.4`
- Git
- Wrangler，已经在项目依赖里，不需要全局安装也可以用 `pnpm exec wrangler`
- Obsidian，用来写 Markdown 文章

常用命令：

```powershell
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm check
pnpm dev:admin
pnpm deploy:worker
```

命令含义：

- `pnpm dev`：只启动博客，默认 `http://localhost:4321`
- `pnpm dev:admin`：同时启动博客和本地后台
- `pnpm build`：正式构建，会输出到 `dist/`
- `pnpm preview`：预览构建后的站点
- `pnpm check`：检查 Astro/TypeScript 类型问题
- `pnpm deploy:worker`：构建并部署到 Cloudflare Worker

## 3. 改成自己的个人站点

优先修改这些文件。

### 3.1 站点基础信息

文件：`src/config/siteConfig.ts`

重点字段：

```ts
title: "西泽",
subtitle: "xize",
site_url: "https://xize.cn.mt",
description: "这是西泽的专场",
keywords: ["xize", "博客", "技术博客"],
themeColor: {
  hue: 165,
  fixed: false,
  defaultMode: "system",
},
navbar: {
  title: "xize",
  logo: {
    type: "image",
    value: "assets/images/firefly.png",
    alt: "🍀",
  },
},
siteStartDate: "2025-05-01",
```

建议替换为：

- `title`：你的中文名、网名或博客名
- `subtitle`：一句短副标题
- `site_url`：最终线上域名，必须和 Cloudflare 访问域名一致
- `description`：搜索引擎和 RSS 会用到
- `keywords`：你的标签，比如个人博客、编程、摄影、笔记
- `themeColor.hue`：主色调，0-360
- `navbar.title`：导航栏显示名称
- `navbar.logo.value`：自己的 Logo 图片

### 3.2 个人资料卡片

文件：`src/config/profileConfig.ts`

重点字段：

```ts
avatar: "assets/images/avatar-custom.webp",
name: "Firefly",
bio: "Hello, I'm Firefly.",
links: [
  {
    name: "GitHub",
    icon: "fa7-brands:github",
    url: "https://github.com/CuteLeaf",
    showName: false,
  },
],
```

需要改成：

- `avatar`：你的头像
- `name`：你的名字
- `bio`：个人签名
- `links`：GitHub、邮箱、Bilibili、QQ、RSS 等

图标可以去 `https://icones.js.org/` 搜索。当前项目已包含 `fa7-brands`、`fa7-solid`、`material-symbols`、`simple-icons`、`mdi` 等图标集。

### 3.3 顶部导航

文件：`src/config/navBarConfig.ts`

当前导航包含：

- 首页
- 归档
- 友链
- 留言板
- 我的：相册、番组
- 关于：赞助、关于
- 链接：GitHub、Gitee、QQ 群

需要按自己的站点删改：

- 不需要友链、赞助、留言板、相册、番组时，优先在 `src/config/siteConfig.ts` 的 `pages` 中关掉
- 不想显示模板作者链接时，修改 `navBarConfig.ts` 里的 `链接` 菜单
- 可以新增外链，比如 Obsidian 数字花园、GitHub、作品集

### 3.4 关于页

文件：`src/content/spec/about.md`

这里目前还有模板作者介绍。建议全部替换成你自己的：

```md
# 关于我

你好，我是 xxx。

## 我会写什么

- 技术笔记
- 生活记录
- 阅读摘录
- 项目复盘

## 联系我

- GitHub: https://github.com/xxx
- Email: xxx@example.com
```

### 3.5 公告

文件：`src/config/announcementConfig.ts`

可改成：

```ts
title: "公告",
content: "欢迎来到我的博客，这里会记录技术、生活和长期思考。",
closable: true,
```

如果不想显示公告，到 `src/config/sidebarConfig.ts` 中把 `announcement` 组件的 `enable` 改成 `false`。

### 3.6 页脚与备案

文件：

- `src/config/footerConfig.ts`
- `src/config/FooterConfig.html`

如需添加 ICP 备案、公安备案、版权声明，把 `footerConfig.ts` 中：

```ts
enable: true
```

然后编辑 `FooterConfig.html`。

## 4. 图片替换方案

这个项目有两类图片目录，要分清楚。

### 4.1 推荐放在 `src/assets/images/`

适合：

- 头像
- Logo
- 首页背景
- 文章封面
- 需要 Astro 优化的图片

优点：

- 构建时会自动优化
- 支持相对路径，比如 `assets/images/avatar-custom.webp`

缺点：

- 图片越多，构建越慢

当前已有：

- `src/assets/images/avatar-custom.webp`
- `src/assets/images/firefly.png`
- `src/assets/images/MyWallpaper/wallpaper-01.webp` 到 `wallpaper-09.webp`

### 4.2 推荐放在 `public/`

适合：

- 相册大量图片
- 音乐文件
- 后台静态文件
- favicon
- 不需要 Astro 优化的资源

访问路径以 `/` 开头，例如：

```text
public/gallery/my-album/cover.webp
```

页面中使用：

```text
/gallery/my-album/cover.webp
```

### 4.3 背景图片

文件：`src/config/backgroundWallpaper.ts`

当前已经使用自己的背景目录：

```ts
desktop: [
  "assets/images/MyWallpaper/wallpaper-01.webp",
  "assets/images/MyWallpaper/wallpaper-02.webp",
],
mobile: [
  "assets/images/MyWallpaper/wallpaper-01.webp",
  "assets/images/MyWallpaper/wallpaper-02.webp",
],
```

推荐方案：

- 桌面背景放横图，建议 1920x1080 或 2560x1440
- 手机背景放竖图，建议 1080x1920
- 格式优先 `webp`，兼容性好
- 单张图片建议压到 300KB-800KB
- 如果背景比较亮，把 `dimOpacity` 调高，比如 `0.35`
- 如果想安静一点，把 `waves.enable.desktop/mobile` 改成 `false`

常用模式：

```ts
mode: "banner"      // 顶部横幅，最稳定
mode: "fullscreen"  // 全屏背景，更有氛围
mode: "overlay"     // 全屏透明覆盖，卡片也会半透明
mode: "none"        // 不用图片背景
```

如果你想彻底换风格，建议先定一个方向：

- 极简文字站：`mode: "none"`，降低装饰，突出文章
- 摄影/个人记录：`mode: "banner"`，用自己的照片做首页横幅
- 氛围感主页：`mode: "fullscreen"` 或 `overlay`，配低透明卡片

### 4.4 头像

推荐路径：

```text
src/assets/images/avatar-custom.webp
```

然后在 `src/config/profileConfig.ts`：

```ts
avatar: "assets/images/avatar-custom.webp"
```

建议尺寸：

- 512x512
- 正方形
- webp 或 avif

### 4.5 Logo

推荐路径：

```text
src/assets/images/logo.webp
```

然后在 `src/config/siteConfig.ts`：

```ts
logo: {
  type: "image",
  value: "assets/images/logo.webp",
  alt: "Logo",
}
```

### 4.6 文章封面

每篇文章 frontmatter 可以写：

```yaml
image: "./cover.webp"
```

如果文章是文件夹形式：

```text
src/content/posts/my-post/index.md
src/content/posts/my-post/cover.webp
```

在 `index.md` 中写：

```yaml
image: "./cover.webp"
```

也可以把封面放到公共目录：

```yaml
image: "/gallery/my-album/cover.webp"
```

## 5. 文章写作规范

文章目录：

```text
src/content/posts/
```

最小 frontmatter：

```yaml
---
title: 我的第一篇文章
published: 2026-05-13
description: 这是一篇测试文章
image: ''
tags:
  - 博客
  - Astro
category: 技术
draft: false
comment: true
---

正文从这里开始。
```

字段说明：

- `title`：文章标题，必填
- `published`：发布时间，必填，格式建议 `YYYY-MM-DD`
- `updated`：更新时间，可选
- `description`：摘要，可选
- `image`：封面，可选
- `tags`：标签数组
- `category`：分类
- `draft`：是否草稿，`true` 不发布，`false` 发布
- `pinned`：是否置顶
- `comment`：是否允许评论
- `password`：文章密码，可选
- `passwordHint`：密码提示，可选

新建文章命令：

```powershell
pnpm new-post my-first-post
```

会生成：

```text
src/content/posts/my-first-post.md
```

## 6. Obsidian 接入方案

推荐方式是把 Obsidian 仓库直接建在博客文章目录：

```text
D:\desktop\blog\Firefly\src\content\posts
```

在 Obsidian 中打开这个目录作为 Vault。这样你在 Obsidian 里写的文章，本质上就是博客文章，不需要复制来复制去。

### 6.1 Obsidian 推荐设置

Obsidian 设置建议：

- Files & Links > New link format：Relative path to file
- Files & Links > Use Wikilinks：关闭
- Files & Links > Default location for new attachments：In subfolder under current folder
- Attachment folder path：`attachments`

原因：

- Astro 更适合标准 Markdown 链接：`[文字](./xxx.md)`
- 图片更适合标准 Markdown：`![图片](./attachments/a.webp)`
- 关闭 Wikilinks 可以减少 `[[双链]]` 在博客里渲染异常

### 6.2 Obsidian 文章模板

可以在 Obsidian 模板插件里建一个模板：

```md
---
title: {{title}}
published: {{date:YYYY-MM-DD}}
description: ''
image: ''
tags: []
category: ''
draft: true
comment: true
---

## 开始

这里写正文。
```

写完准备发布时，把：

```yaml
draft: true
```

改成：

```yaml
draft: false
```

### 6.3 推荐文章组织方式

简单文章：

```text
src/content/posts/my-note.md
```

带图片文章：

```text
src/content/posts/my-note/index.md
src/content/posts/my-note/cover.webp
src/content/posts/my-note/attachments/a.webp
```

`index.md` 中：

```yaml
image: "./cover.webp"
```

正文中：

```md
![图片](./attachments/a.webp)
```

### 6.4 Obsidian 双链处理

如果你坚持使用 `[[笔记名]]`，博客不一定能正确转成链接。最稳方案：

- 对要发布的文章使用标准 Markdown 链接
- 私密知识库可以继续用双链
- 发布前检查一遍是否还有 `[[...]]`

PowerShell 检查命令：

```powershell
Select-String -Path src\content\posts\*.md -Pattern "\[\["
```

## 7. 本地后台写作流程

本地后台用于浏览器里新建/编辑文章。

第一次使用：

```powershell
Copy-Item .env.example .env
```

修改 `.env`：

```env
ADMIN_HOST=127.0.0.1
ADMIN_PORT=8787
ADMIN_TOKEN=换成你的后台密码
ADMIN_CORS_ORIGIN=http://localhost:4321
```

启动：

```powershell
pnpm dev:admin
```

访问：

```text
http://127.0.0.1:8787/admin
```

本地后台直接读写：

```text
src/content/posts/
```

注意：

- `.env` 不能提交到 Git
- `ADMIN_TOKEN` 不要用简单密码
- 本地后台适合你自己电脑使用，不建议直接暴露公网

## 8. Git 上传流程

当前远程仓库：

```text
https://github.com/Luis-ben/Firefly.git
```

日常发布流程：

```powershell
git status
pnpm check
pnpm build
git add .
git commit -m "site: update blog content and config"
git push origin master
```

建议提交前检查：

```powershell
git status --short
pnpm build
```

不要提交：

- `.env`
- `node_modules/`
- `dist/`
- `.wrangler/`
- `.astro/`
- 日志文件

这些大多已经在 `.gitignore` 里配置了。

### 8.1 推荐提交习惯

个人信息改动：

```powershell
git commit -m "site: personalize profile and navigation"
```

文章改动：

```powershell
git commit -m "content: add obsidian workflow note"
```

图片改动：

```powershell
git commit -m "assets: update wallpapers and avatar"
```

后台/部署改动：

```powershell
git commit -m "deploy: configure cloudflare worker admin"
```

## 9. Cloudflare Worker 部署流程

当前项目不是纯静态 `--assets=dist` 方案，而是：

```text
Cloudflare Worker 脚本 + dist 静态资源
```

配置文件：`wrangler.toml`

当前关键配置：

```toml
name = "feirefly"
main = "worker/index.js"
compatibility_date = "2026-05-08"
account_id = "95ddfac0682f045a62fa9f0d671d1fcb"

[assets]
directory = "dist"
binding = "ASSETS"

[vars]
GITHUB_OWNER = "Luis-ben"
GITHUB_REPO = "Firefly"
GITHUB_BRANCH = "master"
GITHUB_CONTENT_ROOT = "src/content/posts"
```

部署：

```powershell
pnpm deploy:worker
```

等价于：

```powershell
pnpm build
wrangler deploy
```

### 9.1 Cloudflare Secrets

必须设置两个密钥：

```powershell
pnpm exec wrangler secret put ADMIN_TOKEN
pnpm exec wrangler secret put GITHUB_TOKEN
```

含义：

- `ADMIN_TOKEN`：线上后台登录密码
- `GITHUB_TOKEN`：Worker 调 GitHub API 修改文章的令牌

GitHub Token 建议使用 fine-grained token：

- Repository access：只选择 `Luis-ben/Firefly`
- Contents：Read and write
- Metadata：Read

不要把真实 token 写进：

- `.env.example`
- `wrangler.toml`
- 文档
- 文章
- Git 提交记录

### 9.2 Cloudflare Git 构建设置

如果使用 Cloudflare 的 Git 集成，建议配置：

```text
Build command: pnpm build
Deployment command: npx wrangler deploy
Root directory: /
```

不要继续用旧的：

```text
wrangler deploy --assets=dist
```

因为旧命令只部署静态资源，不会部署 `worker/index.js`，线上后台 API 会失效。

### 9.3 线上后台

部署后访问：

```text
https://你的域名/admin/
```

登录后可以：

- 新建文章
- 编辑文章
- 发布草稿
- 删除文章

线上后台不会直接改服务器文件，而是通过 GitHub API 提交到仓库。之后 Cloudflare 需要重新部署才能让静态页面更新。

推荐自动化链路：

```text
线上后台保存文章 -> Worker 提交到 GitHub -> Cloudflare 检测到 GitHub 新提交 -> 自动构建部署
```

## 10. 域名与站点 URL

需要统一三个地方：

- `src/config/siteConfig.ts` 里的 `site_url`
- Cloudflare Worker 绑定的自定义域名
- GitHub/Cloudflare 项目中实际访问的生产域名

如果最终域名是：

```text
https://xize.ink
```

则 `siteConfig.ts` 应该写：

```ts
site_url: "https://xize.ink"
```

不要一个地方写 `xize.cn.mt`，另一个地方用 `xize.ink`，否则 RSS、sitemap、OG 分享链接可能不一致。

## 11. 推荐个人化改造顺序

第一阶段：先把站点变成你的。

1. 改 `src/config/siteConfig.ts`
2. 改 `src/config/profileConfig.ts`
3. 改 `src/content/spec/about.md`
4. 改 `src/config/navBarConfig.ts`
5. 替换头像、Logo、背景
6. `pnpm build` 确认没问题

第二阶段：整理内容。

1. 删除或改写模板示例文章
2. 保留 `guide/` 作为参考，或移动到草稿
3. 建立自己的分类和标签规范
4. 用 Obsidian 开始写第一批文章

第三阶段：部署。

1. 设置 GitHub 远程仓库
2. 提交代码并推送到 `master`
3. 配置 Cloudflare Worker
4. 设置 `ADMIN_TOKEN` 和 `GITHUB_TOKEN`
5. 部署并绑定域名
6. 访问 `/admin/` 测试线上后台

第四阶段：长期维护。

1. 日常用 Obsidian 写文章
2. 本地 `pnpm build` 检查
3. Git 提交推送
4. Cloudflare 自动部署
5. 重要改动前先新建分支

## 12. 常见问题排查

### 12.1 本地能看，线上看不到新文章

检查：

- 文章 `draft` 是否为 `false`
- `published` 是否是合法日期
- 是否已经 `git push`
- Cloudflare 是否重新部署
- 构建日志是否报错

### 12.2 图片本地显示，线上不显示

检查：

- 图片路径大小写是否一致
- 图片是否已经提交到 Git
- `src` 图片是否使用 `assets/images/...`
- `public` 图片是否使用 `/...`
- Obsidian 是否生成了绝对本地路径，比如 `C:\Users\...`

### 12.3 Cloudflare 后台 401

检查：

- 输入的密码是否等于 `ADMIN_TOKEN`
- Cloudflare Worker Secret 是否设置成功
- 本地 `.env` 和线上 Secret 是两套配置，不会自动同步

### 12.4 Cloudflare 后台保存失败

检查：

- `GITHUB_TOKEN` 是否设置
- GitHub Token 是否有 Contents Read and write 权限
- `wrangler.toml` 里的 owner/repo/branch 是否正确
- GitHub 分支是不是 `master`

### 12.5 构建失败

优先运行：

```powershell
pnpm check
pnpm build
```

常见原因：

- frontmatter 日期格式不对
- `tags` 不是数组
- 图片路径写错
- Markdown 中有不兼容语法
- 文章标题缺失

## 13. 我的建议方案

以你现在这个项目状态，我建议走这条路线：

1. 保留 Astro + Firefly，不重做框架
2. 背景统一放 `src/assets/images/MyWallpaper/`
3. 头像用 `src/assets/images/avatar-custom.webp`
4. 日常写作用 Obsidian 直接打开 `src/content/posts`
5. 本地偶尔用 `/admin/` 快速编辑
6. 线上后台只用于临时改文章，不作为主要写作入口
7. Cloudflare 使用 Worker 部署，不迁移 Pages
8. 所有内容最终都通过 GitHub 保存，GitHub 是唯一可信备份

这套方案的好处是：写作体验舒服，部署成本低，内容都在 Git 里，不会被某个后台或数据库锁死。
