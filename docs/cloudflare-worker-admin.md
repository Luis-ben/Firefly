# Cloudflare Worker 上使用 Firefly 管理后台

这个方案保留现有的 Cloudflare `feirefly` 项目和 `xize.ink` 域名，不迁移到 Pages。

原来的部署命令 `wrangler deploy --assets=dist` 只发布静态资源，所以 Cloudflare 会提示不能添加 Variables/Secrets。现在项目改为：

```text
静态资源 dist/ + Worker 脚本 worker/index.js
```

Worker 负责：

- 继续托管博客静态页面
- 托管 `/admin/` 管理后台
- 处理 `/api/health`
- 处理 `/api/posts` 文章管理 API
- 通过 GitHub API 把文章改动提交到仓库

## 本地构建

```bash
pnpm build
```

## 部署到现有 feirefly 项目

```bash
pnpm deploy:worker
```

等价于：

```bash
pnpm build
wrangler deploy
```

如果继续使用你截图里的 Cloudflare Git 构建，需要把构建设置改成：

```text
Build command: pnpm build
Deployment command: npx wrangler deploy
Root directory: /
```

重点是删除旧部署命令里的 `--assets=dist --compatibility-date=...`，让 Wrangler 读取仓库里的 `wrangler.toml`。这样 Cloudflare 才会部署 `worker/index.js`，后台 API 和 Secrets 才能正常工作。

`wrangler.toml` 已经配置：

```text
name = "feirefly"
main = "worker/index.js"
assets.directory = "dist"
assets.binding = "ASSETS"
```

## Cloudflare 变量和密钥

普通变量已经写在 `wrangler.toml`：

```text
GITHUB_OWNER=Luis-ben
GITHUB_REPO=Firefly
GITHUB_BRANCH=master
GITHUB_CONTENT_ROOT=src/content/posts
```

需要在 Cloudflare Worker 项目中设置 Secrets：

```bash
wrangler secret put ADMIN_TOKEN
wrangler secret put GITHUB_TOKEN
```

`ADMIN_TOKEN` 是后台登录密码。

`GITHUB_TOKEN` 建议使用 GitHub fine-grained personal access token，只授权 `Luis-ben/Firefly` 仓库，并开启：

```text
Contents: Read and write
Metadata: Read
```

不要把真实 token 写进仓库文件。

## 线上修改文章

部署后访问：

```text
https://xize.ink/admin/
```

输入 `ADMIN_TOKEN` 后即可新建、编辑、发布和删除文章。

保存文章时，Worker 会提交 Markdown 到 GitHub `master` 分支。你的 Cloudflare 项目如果启用了 Git 集成或自动构建，需要确保它会在 GitHub 新提交后重新部署；如果没有自动构建，可以保存后手动运行：

```bash
pnpm deploy:worker
```

## 本地调试后台

```bash
pnpm dev:admin
```

本地地址：

```text
http://127.0.0.1:8787/admin
```

本地后台直接修改 `src/content/posts` 文件；线上后台通过 GitHub API 修改仓库文件。
