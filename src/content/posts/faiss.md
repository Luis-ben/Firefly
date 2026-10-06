---
title: "第一篇：从零构建知识库：文档解析、切块与 Faiss 向量入库工程"
published: 2026-09-09
description: ''
image: "/media/posts/2026/10/post-202610060858-20261006090122-bqc5xs.svg"
tags: []
category: Rag
draft: true
pinned: false
comment: true
---

第一篇：从零构建知识库：文档解析、切块与 Faiss 向量入库工程

专栏导读：
很多初学者以为 RAG（检索增强生成）仅仅是“调个 API + 查向量库”，但真正决定系统成败的下限，往往在于数据入库质量。本篇作为系列第一篇，带你完整走通知识库准备阶段：从原始文档的多格式解析、文本清洗降噪，到滑动分块与 Faiss 向量内积索引持久化。

一、大模型的痛点与 RAG 解决方案

大模型（LLM）虽然通晓天文地理，但在企业落地时常有两大死穴：

幻觉（胡说八道）：遇到未知内容倾向于强行编造；
私域盲区：缺乏企业内部文档、最新手册和专有规范。

RAG（检索增强生成） 的思路非常简单直观：把“开卷考试”的参考书切碎并建立索引存入本地，当用户提问时，先检索出最相关的段落，再打包喂给大模型做事实依据。

二、第一阶段总览：准备知识库

构建本地知识库的核心目标，就是把长篇杂乱的“死文件”，变成 AI 能够秒级翻阅的“智能数字图书馆”。


![mermaid-diagram](/media/posts/2026/10/post-202610060858-20261006090112-jkbiag.svg)



主要步骤拆解如下：

Extract Data/Context：读取 PDF、Markdown、Word，提取纯文本与上下文。
Clean：清洗多余噪音、空白符、非法排版字符。
Split in Chunks：将万字长文切碎成小文本段。
Embeddings：调用嵌入模型，将每段文字转换成高维向量（发“数字身份证”）。
Build Semantic Index：构建向量索引并存盘（VectorStore）。
三、工程实现：数据处理四大金刚
1. 文档解析与清洗（document_parser.py）

现实中的文件各式各样，必须先做标准化解析和噪音清洗：

python
import re
class DocumentParser:
    """多格式解析与清洗"""
    def parse_pdf(self, file_path: str) -> str:
        # 使用 pypdf / pdfplumber 等库提取文本
        raw_text = "...提取后的原始文本..."
        return self.clean(raw_text)
    def clean(self, text: str) -> str:
        # 1. 清理多余空行和制表符
        text = re.sub(r'\n+', '\n', text)
        # 2. 清理不可见特殊字符与乱码
        text = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f]', '', text)
        return text.strip()
2. 文本分块器（TextChunker）

为什么不能整篇文章一起存？

大模型上下文与 Embedding 模型的输入长度有限。
文档越长，主题越发散，提取出来的向量越“平庸”，检索精度直线下降。

工程策略：采用固定批量窗口分块，同时设置 Overlap（重叠窗口）：

python
class TextChunker:
    def __init__(self, chunk_size: int = 400, overlap: int = 50):
        self.chunk_size = chunk_size
        self.overlap = overlap
    def split(self, text: str) -> list[str]:
        chunks = []
        start = 0
        while start < len(text):
            end = start + self.chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            # 滑动窗口步长 = chunk_size - overlap
            start += (self.chunk_size - self.overlap)
        return chunks

提示：保留 10%~15% 的 overlap 能避免关键句在切割边界处被无情腰斩。

3. 向量嵌入（Embedder）：给每句话发“数字身份证”

嵌入模型将一段文本映射为一组高维数字（例如 768 或 1024 维度的浮点数矩阵）：

“如何请年假”与“带薪年休假申请流程”即便字面上字眼不同，经 Embedding 后在空间中的距离也非常相近。
4. 向量库与 Faiss 索引（VectorStore）

得到向量矩阵后，需要建立索引并写入磁盘：

向量归一化（L2 Normalization）：入库前将每个向量单位化为模长为 1。
内积索引（Inner Product, IP）：归一化之后，两向量的点积就等于余弦相似度（Cosine Similarity），检索效率飞跃提升。
python
import faiss
import numpy as np
class VectorStore:
    def __init__(self, dimension: int = 768):
        # 采用内积索引 IndexFlatIP（搭配归一化即可做余弦搜索）
        self.index = faiss.IndexFlatIP(dimension)
        self.docs = []
    def add_documents(self, chunks: list[str], embeddings: np.ndarray):
        # 1. 向量归一化
        faiss.normalize_L2(embeddings)
        # 2. 添加到索引
        self.index.add(embeddings)
        self.docs.extend(chunks)
    def save(self, index_file: str):
        faiss.write_index(self.index, index_file)
四、本篇小结与下篇预告

到这里，我们的“智能图书馆”就已经建好了：所有知识被切成规整的书签，标上了数字身份证，并且在 Faiss 中随时待命。

但是，用户提问时直接用余弦相似度取 Top-K 真的够用吗？如果搜出来的 5 段话全是一模一样的“复读机新闻”怎么办？
下一篇我们深入核心算法：Bi-Encoder 粗筛 + MMR 多样性挑选（水果摊理论）。