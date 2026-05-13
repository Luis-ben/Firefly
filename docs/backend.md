# Firefly 后端管理服务

这个项目仍然保持 Astro 静态博客结构，新增的后端只是一个内容管理辅助服务。它直接读写 `src/content/posts` 下的 Markdown/MDX 文件，适合本地写作、私有服务器后台、自动化发文。

## 启动

1. 复制环境变量示例：

```bash
cp .env.example .env
```

2. 修改 `.env` 里的 `ADMIN_TOKEN`。

3. 单独启动后端：

```bash
pnpm admin
```

或者同时启动 Astro 博客和后端：

```bash
pnpm dev:admin
```

默认地址：

- 博客：`http://localhost:4321`
- 后端：`http://127.0.0.1:8787`
- 管理后台：`http://127.0.0.1:8787/admin`

如果网站部署在 Cloudflare Worker，请查看 [Cloudflare Worker 上使用 Firefly 管理后台](./cloudflare-worker-admin.md)。

## 管理后台

启动后打开：

```text
http://127.0.0.1:8787/admin
```

输入 `.env` 中的 `ADMIN_TOKEN` 即可进入后台。当前后台支持：

- 查看全部文章、草稿、已发布文章
- 搜索标题、分类、标签和 slug
- 新建 Markdown 文章
- 编辑标题、日期、分类、标签、封面图、摘要和正文
- 保存草稿、发布文章、撤回为草稿
- 删除草稿，或确认后删除已发布文章

## 接口

所有文章管理接口都需要请求头：

```http
Authorization: Bearer your-admin-token
```

### 健康检查

```http
GET /api/health
```

### 文章列表

```http
GET /api/posts?includeDraft=true
```

### 读取文章

```http
GET /api/posts/firefly
```

### 创建文章

```http
POST /api/posts
Content-Type: application/json

{
	"slug": "my-new-post",
	"title": "我的新文章",
	"description": "",
	"tags": ["博客"],
	"category": "随笔",
	"draft": true,
	"body": "这里写正文。"
}
```

### 更新文章

```http
PUT /api/posts/my-new-post
Content-Type: application/json

{
	"frontmatter": {
		"title": "我的新文章",
		"draft": false
	},
	"body": "更新后的正文。"
}
```

### 删除文章

默认只允许删除草稿：

```http
DELETE /api/posts/my-new-post
```

删除已发布文章需要显式传入：

```http
DELETE /api/posts/my-new-post?force=true
```

## 后续建议

- 第一阶段：继续用 Markdown 文件做数据源，补一个 `/admin` 管理页面调用这些接口。
- 第二阶段：把认证换成登录会话，并加图片上传接口。
- 第三阶段：如果文章量很大，再考虑数据库；否则文件模式更利于静态部署、Git 备份和迁移。
