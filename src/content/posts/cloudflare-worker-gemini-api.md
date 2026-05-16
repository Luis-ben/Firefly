---
title: "使用 Cloudflare Worker 完美反代 Gemini API：彻底解决地域限制"
published: 2026-05-16
description: "关于在国内不需要魔法就可以调动api"
image: ''
tags: [cloudflare]
category: "反代理"
draft: false
pinned: false
comment: true
---

【保姆级教程】使用 Cloudflare Worker 完美反代 Gemini API：彻底解决地域限制


在开发或使用基于大语言模型的应用（如自建的 AI 写作助手、本地脚本、第三方客户端）时，Google Gemini API 凭借其超大的上下文窗口和极高的性价比（甚至有免费额度）成为了不少开发者的首选。
然而，Gemini API 目前对部分地区的 IP 限制非常严格，直接请求经常会遇到 403 Forbidden 或连接超时的问题。
为了让本地开发或部署在特殊节点上的服务能够稳定调用 Gemini，最优雅、最省钱（完全免费）的解决方案就是利用 Cloudflare Workers 搭建一个专属的反向代理。

本文将手把手带你完成全流程配置，只需 5 分钟，让你的 Gemini API 满血复活！
为什么选择 Cloudflare Workers？
• 完全免费：Cloudflare Workers 每天提供 10 万次的免费请求额度，个人开发或轻度使用绰绰有余。
• 全球加速：利用 Cloudflare 的边缘网络，自动选择最优节点，延迟极低。
• 无需维护：Serverless 架构，不需要购买服务器，不需要配置 Nginx，代码部署后终身不管。
• 安全隐私：可以隐藏你的真实请求 IP。
准备工作
在开始之前，请确保你已经拥有：
1. 一个 Cloudflare 账号（如果没有，去官网注册一个即可）。
2. 一个 Gemini API Key（前往 Google AI Studio 获取）。
3. （可选但推荐）一个托管在 Cloudflare 上的自定义域名（因为 Cloudflare 自带的 *.workers.dev 域名在部分地区可能遭遇 DNS 污染）。
第一步：创建 Cloudflare Worker
1. 登录 Cloudflare 控制台。
2. 在左侧导航栏中，点击 "Workers 和 Pages"（Workers & Pages），然后点击 "创建"（Create）。
3. 选择 "创建 Worker"（Create Worker）。
4. 为你的 Worker 起一个名字（例如：gemini-proxy），然后点击右下角的 "部署"（Deploy）。


![局部截取_20260516_171939](/media/posts/2026/05/cloudflare-worker-gemini-api-20260516092338-dv8ns0.png)


第二步：编写反代代码
1. 部署成功后，点击 "编辑代码"（Edit Code）进入在线编辑器。
2. 清空原本的 worker.js 代码，将以下代码完整复制进去：
JavaScript
下载代码
复制代码
export default
 {
  async fetch(request, env, ctx)
 {
    const url = new
 URL(request.url);
    
    // 将请求的目标域名替换为 Gemini 的官方 API 域名
    url.host = 
'generativelanguage.googleapis.com'
;

    // 构造新的请求对象，保留原始请求的方法、Headers 和 Body
    const modifiedRequest = new
 Request(url.toString(), {
      headers
: request.headers,
      method
: request.method,
      body
: request.body,
      redirect: 'follow'
    });

    try
 {
      // 转发请求到 Gemini 官方服务器
      const response = await
 fetch(modifiedRequest);
      
      // 构造新的响应，允许跨域（CORS），方便前端直接调用
      const modifiedResponse = new
 Response(response.body, response);
      modifiedResponse.headers.set(
'Access-Control-Allow-Origin', '*'
);
      modifiedResponse.headers.set(
'Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'
);
      modifiedResponse.headers.set(
'Access-Control-Allow-Headers', '*'
);

      return
 modifiedResponse;
    } 
catch
 (error) {
      return new Response(JSON.stringify({ error
: error.message }), {
        status: 500
,
        headers: { 'Content-Type': 'application/json'
 }
      });
    }
  },
};


![局部截取_20260516_172433](/media/posts/2026/05/cloudflare-worker-gemini-api-20260516092502-3w4l36.png)


3. 点击右上角的 "部署"（Deploy）保存并发布代码。
第三步：绑定自定义域名（强烈推荐）
正如前文所说，默认的 *.workers.dev 域名在国内部分网络环境下访问不够稳定。绑定自己的域名可以一劳永逸。
免费域名地址：my.dnshe.com


![局部截取_20260516_172822](/media/posts/2026/05/cloudflare-worker-gemini-api-20260516093048-bxzdnp.png)


1. 返回到刚才创建的 Worker 详情页面。
2. 切换到 "设置"（Settings）选项卡，选择 "触发器"（Triggers）。
3. 在 "自定义域"（Custom Domains）下方，点击 "添加自定义域"。
4. 输入你已经在 Cloudflare 解析的二级域名（例如：gemini.yourdomain.com）。
5. 点击 "添加自定义域"，Cloudflare 会自动帮你生成 SSL 证书并完成解析绑定。
第四步：测试与使用
现在，你已经拥有了一个专属的 Gemini 反代接口！它的使用方法非常简单，只需要将官方域名的部分替换为你自己的域名即可。
1. 官方 API 地址
https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_API_KEY
2. 你的专属反代地址
https://gemini.yourdomain.com/v1beta/models/gemini-pro:generateContent?key=YOUR_API_KEY
3. 在第三方工具/代码中集成
如果你使用的是某些支持自定义 API Base URL 的开源项目或自建的 Python/Java 后端，你只需要将 API Base/Host 修改为：
https://gemini.yourdomain.com
注意：部分客户端在填写 Base URL 时，会自动在末尾拼接路径，请根据客户端的提示决定是否保留后方的 /v1 或 /v1beta。


避坑指南与进阶技巧
1. 流式传输（Stream）支持：上述 Cloudflare Workers 代码原生支持 ReadableStream。如果你在调用 Gemini 的 streamGenerateContent 接口，它会自动流式返回响应，不需要额外修改代码。
2. 安全防护（可选）：目前的配置是任何人知道你的反代域名都可以使用。如果你打算公开或者防止被人盗刷，可以在 Workers 代码中加入校验，比如判断 request.headers 中是否包含特定的自定义 Key，或者直接在 Worker 的环境变量中给 API Key 做二次加密。
3. 配额限制：免费版 Workers 限制 10 万次/天，且有每分钟并发限制。如果你的博客流量极大或应用并发极高，建议关注 Cloudflare 的付费计划（Paid Plan）。

结语
通过 Cloudflare Workers 反代 Gemini API，不仅解决了网络连接的痛点，还顺便解决了前端跨域的问题，可以说是独立开发者和 AI 爱好者的必备技能。