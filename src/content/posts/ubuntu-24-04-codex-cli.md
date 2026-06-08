---
title: "国内环境/腾讯云 Ubuntu 24.04 完美安装 Codex CLI 避坑指南"
published: 2026-06-08
description: ''
image: ''
tags: [codex, "chat-gpt5.5"]
category: "ai操作"
draft: false
pinned: false
comment: true
---

# 如果大家想在虚拟机上改东西可以用codex更方便对小白来说，
# 以下是国内环境/腾讯云 Ubuntu 24.04 完美安装 Codex CLI 避坑指南

终于把国内云服务器和虚拟机上安装 Codex CLI 远程连接的逻辑彻底摸透了。如果你直接按照国外那些官方教程一步一步走，在国内的网络环境下，大概率会遇到两个让人抓狂的问题：

1. **进度条死锁**：Node.js 和 npm 的官方服务器都在国外，国内直接下载经常卡在 0% 动弹不得，或者干连报错断开。
2. **腾讯云“特产”报错**：如果你图省事直接用 Ubuntu 默认的 `snap` 去装，会和腾讯云后台自带的自动化助手（`tat_agent`）起冲突，直接弹出一长串关于 `cgroup` 的致命报错，软件根本打不开。

**最稳妥的解决办法：** 彻底放弃 snap 安装，直接在系统里装纯正的官方 Node.js 20，并**全程强行切换成国内淘宝镜像加速**。

以下是亲测 100% 成功的完整步骤：

---

## 第一步：虚拟机基础换源（仅本地虚拟机需要）

> 💡 *注：如果你用的是腾讯云、阿里云等公网服务器，服务商已经默认帮你配好了内网加速源，可以跳过这一步，直接从第二步开始。*

如果你是在自己电脑上用 VMware 或 VirtualBox 装的本地虚拟机，先在终端运行下面这行命令，把软件源一键切到国内清华大学镜像，给后面的组件下载提速：

```bash
sudo sed -i 's//archive.ubuntu.com/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/ubuntu.sources
sudo sed -i 's//security.ubuntu.com/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/ubuntu.sources
sudo apt update && sudo apt upgrade -y

```

---

## 第二步：一键配置 Node.js 20 环境

Codex CLI 必须要依靠 Node.js 环境才能运行。我们直接把官方最新的 20.x 维护源注入到系统里，然后进行安装：

```bash
export DEBIAN_FRONTEND=noninteractive
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

```

---

## 第三步：走国内镜像秒杀安装 Codex CLI

有了真正可用的 `nodejs` 和 `npm` 后，全局安装 Codex 时必须加上国内淘宝镜像源（`npmmirror`）的加速后缀，不然极易卡死：

```bash
sudo npm install -g @openai/codex --registry=https://registry.npmmirror.com --unsafe-perm=true

```

*（换成国内镜像后，原本可能卡几个小时的下载，现在只要 5 到 10 秒就能瞬间秒杀完成。）*

---

## ⚙️ 第四步：写入远程连接配置并刷新

安装完后，我们还需要手动帮 Codex 建立一个配置文件，告诉它允许接受来自 Windows 客户端的远程连接。

直接复制并运行以下命令：

```bash
# 1. 创建配置文件夹并写入开启参数
mkdir -p ~/.codex
cat > ~/.codex/config.toml << EOF
[features]
remote_connections = true
EOF

# 2. 修复环境变量路径，防止终端找不到 codex 命令
if ! grep -q "/usr/local/bin" ~/.bashrc; then
    echo 'export PATH="$PATH:/usr/local/bin:/usr/bin"' >> ~/.bashrc
fi
source ~/.bashrc

```

---

## 🏁 第五步：大功告成，验证结果

最后，在终端输入：

```bash
codex --version

```

只要屏幕上老老实实吐出了 `codex-cli 0.137.0`（或者类似的最新版本号），就说明服务器/虚拟机端已经完美搞定了，而且绝对不会再弹腾讯云后台冲突的报错！

有人看的话下期分享如何将codex连接云服务器，虚拟Ubuntu 这种有点小麻烦需对应还要生成，因为不让设置https


![局部截取_20260609_003100](/media/posts/2026/06/ubuntu-24-04-codex-cli-20260608163235-s6feah.png)


