---
title: "09 CICD and Evalgent 测试、流水线与可靠性评测"
published: 2026-09-01
description: ''
image: ''
tags: []
category: Agent
draft: false
pinned: false
comment: true
---

# 09-CICD-and-Eval：Agent 测试、流水线与可靠性评测

> **本篇对应 GitHub 源码**：`10-CICD/` 与 `99-My idea/Agent eval/`  
> **涵盖核心内容**：pytest 自动化回归、Mock LLM 单元测试技巧、GitLab CI / Jenkins 流水线门禁、核心评测哲学（Capability vs Reliability）、确定性评估指标体系  
> **导读**：  
> 很多开发者开发 Agent 全靠“人肉敲几句话手工测试”，改了一行提示词，旧功能暗中崩溃了也浑然不知。在 `99-My idea` 中，作者一针见血地指出：**“能跑通一次只叫有能力（Capability），能在生产环境连跑 100 次不翻车才叫工程可靠性（Reliability）！”** 本篇教你如何为 Agent 搭建自动化回归测试、CI/CD 持续集成流水线与可靠性评估体系。

---

## 零、核心痛点：为什么 Agent 测试比传统软件难十倍？

传统软件是确定性的（`1 + 1` 永远等于 `2`）。但大模型驱动的 Agent 具有四大不确定性：
1. **输出随机性**：同一个 Prompt 发送两次，词句表达和工具调用的先后次序可能略有差异；
2. **API 费用与耗时**：如果跑一次完整测试套件要发 500 次真实的 DeepSeek/GPT 请求，不仅速度慢，而且每次都要花真金白银；
3. **外部环境依赖**：测试查天气、查数据库，如果外部接口偶发抖动，会导致测试用例“假失败”。

---

## 一、解决方案 1：Mock LLM 脱机单元测试

测试 Agent 的核心目标是：**验证你手写的 Python 控制流、状态机和工具分发是否稳健，而不是在测试大模型本身聪不聪明！**

因此，标准的工程做法是**Mock 掉大模型（使用假响应驱动）**：

```python
import pytest
from unittest.mock import MagicMock

# 模拟大模型的固定测试桩 (Stub / Mock)
def test_agent_tool_dispatch():
    mock_llm = MagicMock()
    
    # 模拟大模型第 1 轮返回: 触发 calculator 工具
    mock_llm.predict.side_effect = [
        "Thought: 需要计算\nAction: calculator\nAction Input: 12 * 8",
        "Thought: 拿到结果\nFinal Answer: 96"
    ]
    
    tools = {"calculator": lambda expr: str(eval(expr))}
    
    # 运行你的 Agent 循环
    result = react_loop("算一下 12 * 8", tools, mock_llm)
    
    # 断言结果正确性
    assert result == "96"
    # 断言大模型被调用了刚好 2 次
    assert mock_llm.predict.call_count == 2
```

> **收益**：测试无需联网、不花一分钱 Token 费用、0.1 秒内秒级跑完，能够随时作为回归测试跑几百遍！

---

## 二、解决方案 2：核心评测哲学（Capability vs Reliability）

在 `99-My idea/Agent eval/01-eval.md` 中，作者提出了工业级交付的终极审判标准：

```
                    ┌────────────────────────┐
                    │      Capability        │  “能不能做？”
                    │      (基础能力)        │  Demo 里跑通一次就算有能力
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │      Reliability       │  “能不能稳定做？”
                    │      (工程可靠性)      │  在生产环境连跑 100 次都不翻车！
                    └────────────────────────┘
```

### 生产级评估三大硬指标
1. **通过率（Pass Rate / Pass@K）**：  
   准备 50 个典型的金标任务数据集（Ground Truth），连续执行 3 轮。统计任务最终被成功解决的百分比（如必须 $\ge 92\%$）；
2. **步数漂移度（Step Drift）**：  
   统计同样难度的任务，Agent 平均需要消耗多少步才能完成。如果一次 Prompt 修改让原本 3 步完成的任务普遍漂移到了 8 步，说明提示词引起了注意力涣散；
3. **自愈容错率（Self-Healing Rate）**：  
   人为注入一次工具异常（如故意返回 404 或格式错误），观察 Agent 是直接崩溃报错，还是能通过 Reflection 反思机制成功换路自愈。

---

## 三、流水线集成：GitLab CI / Jenkins 自动化门禁

将 Agent 测试套件接入持续集成流水线（CI/CD）：

```mermaid
flowchart LR
    Push[开发者提交代码 Git Push] --> Lint[1. 代码规范检查 flake8/black]
    Lint --> Unit[2. Mock 单元测试 pytest (脱机免 Token)]
    Unit --> Eval[3. 小型金标评测集 (5个典型任务跑真模型)]
    Eval --> Check{指标是否达标? Pass Rate >= 90%}
    Check -->|达标| Deploy[自动部署上线 Release]
    Check -->|未达标| Block[阻断合并, 触发告警]
```

### 极简 GitLab CI 脚本配置（`.gitlab-ci.yml`）
```yaml
stages:
  - test
  - eval

unit_tests:
  stage: test
  script:
    - pip install -r requirements.txt
    - pytest tests/test_agent_units.py -v

reliability_eval:
  stage: eval
  script:
    # 跑核心金标数据集，统计可靠性得分
    - python eval/run_benchmark.py --min-pass-rate 0.90
  only:
    - main
```

---

## 本篇小结

1. **测试与开发同等重要**：没有测试网的 Agent，改动一行 Prompt 就是在生产环境“裸奔”；
2. **解耦测试分层**：用 Mock LLM 测试本地 Python 控制流与状态机（极速、零成本）；用金标评测集测试模型真实理解力；
3. **认清评测本质**：告别“演示一次成功就大功告成”的幻想，以**高胜率、低漂移、抗故障的工程可靠性（Reliability）**为唯一交付标准；
4. **下一篇预告**：单体 Agent 的测试通关后，如何用现代图状态机框架编排复杂的多智能体任务？下一篇进入 **10-LangGraph：图状态机多智能体实战**！
