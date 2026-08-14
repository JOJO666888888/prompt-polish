# ✨ prompt-polish — dsh 提示词优化助手

> A [dsh](https://github.com/deepseek-ai/deepseek-harness) plugin that polishes, completes and expands your prompt **before you send it**, using a dedicated prompt-engineering agent. Supports rewrite, multi-round rewriting and undo. Loads automatically when the harness starts — no per-session setup.

在输入命令之前，调用一个专门的「提示词工程专家」agent，对你的原始草稿进行**补全、消歧、扩写、结构化**，使其符合提示词工程规范、效力更高。插件随 harness 启动自动加载并持久生效，无需每次手动启用。

## ✨ 功能特性

- **一键润色**：输入框工具行点击「✨ 润色」，专门的 agent 立即改写你的草稿：
  - 补全缺失要素（目标、对象、范围、约束、输出格式、验收标准）
  - 消除歧义，把含糊表述改写为明确指令
  - 按提示词工程最佳实践组织结构（角色 / 任务 / 步骤 / 输出格式 / 质量约束）
  - 保持原始意图与语言，只输出优化后的命令正文
- **自动写入输入框**：润色完成后结果直接填入输入框，可直接回车发送
- **重写 / 多轮改写**：面板内可再优化一轮（🔄），或自动迭代 3 轮（⏩），每轮结果都进入历史
- **撤回 / 版本回溯**：逐步回退上一版本（↩），或点击版本标签（原文 / v1 / v2…）跳回任意历史版本
- **手动微调**：面板内结果可自由编辑后再应用
- **应用并发送**：一步完成「写入输入框 + 直接发送」
- **内置日志系统**：侧边栏底部「📋 日志」按钮打开浮层面板，host/client 双侧诊断日志 + 健康状态（接口状态、模型路由、最近错误），问题可自排查
- **零构建**：client 端为手写 `window.__ModuleLoader__` bundle，无需任何构建工具链

## 🧩 工作原理

```
┌───────────────────────────── 浏览器 ─────────────────────────────┐
│ conversation.input.left      「✨ 润色」按钮                       │
│ conversation.input.dock      优化面板（版本历史/撤回/重写/应用）    │
│ sidebar.footer.action        「📋 日志」按钮                       │
│ shell.overlay                日志浮层                              │
│         │  fetch (同源)                                           │
└─────────┼────────────────────────────────────────────────────────┘
          ▼
┌───────────────────────────── Host ──────────────────────────────┐
│ POST /pp-api/polish   调用 llm.stream 跑「提示词优化专家」agent    │
│                       模型路由：agentDefaultModel 当前默认选择     │
│                       （如 opencode-go / deepseek-v4-flash）      │
│ GET  /pp-api/logs     返回日志缓冲 + 健康诊断                      │
└──────────────────────────────────────────────────────────────────┘
```

- **Host 半**（`index.js`）：普通 Cordis 插件，通过 `webServer.register` 暴露两个同源 HTTP 接口（避开 `/api` 前缀）；`llm.stream` 调用支持多轮迭代（每轮基于上一轮结果），带 120s 超时保护。
- **Client 半**（`client.js`）：手写 `window.__ModuleLoader__.load({ id, factory })` 格式的浏览器 bundle（与 dsh 产品级 client 插件同构），通过 `package.json` 的 `dsh.client` 声明被 `dsh-client-modules` 扫描并 serve（`/plugins/prompt-polish/client.js`），无需构建。
- **持久化**：插件作为一行注册在 profile 组合（`cordis.patch.yml`）中，harness 启动即挂载；区别于动态 Cordis 插件，重启后依然存在。

## 📦 安装

### 环境要求

- dsh（DeepSeek Harness）**web 模式**（`dsh --profile web`）
- Node.js（dsh 运行环境自带）
- 一个可用的 LLM 模型路由（插件自动使用你在 dsh 中配置的**默认模型**，无需单独配置）

### 步骤 1：获取插件代码

```bash
git clone https://github.com/JOJO666888888/prompt-polish.git
# 或从仓库页面 Download ZIP 解压
```

### 步骤 2：放置到 dsh 的 node_modules

dsh 通过 `require.resolve('prompt-polish/package.json')` 定位插件，因此 **`prompt-polish` 目录必须放在 dsh 包（`@deepseek-ai/dsh`）所在的那一层 `node_modules` 根目录下**（与 `@deepseek-ai` 平级）。

```bash
# 找到 dsh 包的位置，例如：
#   npm/pnpm 全局安装：npm root -g / pnpm root -g
#   或你的 dsh 部署目录下的 node_modules
cp -r prompt-polish <dsh 的 node_modules 根目录>/
```

验证：

```bash
node -e "console.log(require.resolve('prompt-polish/package.json'))"
# 应输出类似：...\node_modules\prompt-polish\package.json
```

### 步骤 3：注册到 profile 组合

编辑 dsh 用户配置中的 `$DSH_HOME/profiles/web/cordis.patch.yml`（`DSH_HOME` 默认为 `~/.dsh`），在顶层数组追加：

```yaml
- insert:
    - id: prompt-polish
      name: prompt-polish
```

### 步骤 4：重启并刷新

1. 重启 dsh（`dsh --profile web`）
2. 浏览器 **Ctrl + Shift + R** 硬刷新页面

完成后：输入框工具行出现「✨ 润色」按钮，侧边栏底部出现「📋 日志」按钮。

## 🚀 使用

1. 在输入框输入草稿（哪怕不完整，例如「优化一下我的代码」）
2. 点击 **「✨ 润色」**（输入为空时按钮自动禁用）
3. 等待约 20~30 秒（模型调用中，输入框上方面板显示「⏳ 优化中…」）
4. 完成后：
   - 输入框**自动填入**润色后的完整提示词，可直接回车发送
   - 优化面板保留：**↩ 撤回**、**🔄 重写**、**⏩ 多轮改写 ×3**、**✓ 应用到输入框**、**✈ 应用并发送**
   - 点击版本标签（原文 / v1 / v2…）可跳回任意历史版本

### 日志与排障

点击侧边栏底部 **「📋 日志」**（或优化面板头部的 📋 按钮）打开日志面板：

- 合并显示 host / client 双侧日志（按时间倒序，错误红色高亮）
- 健康状态区：接口状态、成功/失败计数、默认模型、LLM providers、最近错误
- 「🔄 刷新」重新拉取 host 日志，「🗑 清空」清空 client 侧记录

常见问题：

| 现象 | 原因 / 处理 |
| --- | --- |
| 没有「✨ 润色」按钮 | 未刷新浏览器（Ctrl+Shift+R）；或组合行未生效（检查 `cordis.patch.yml`） |
| 按钮置灰不可点 | 输入框为空 |
| 点击后无反应 | 打开日志面板查看错误；确认 `/pp-api/polish` 接口可访问（见下） |
| 提示「无法解析可用的模型路由」 | dsh 未配置默认模型，在 Models 设置页选择模型后重试 |

接口自检：

```bash
curl -X POST http://127.0.0.1:8080/pp-api/polish -H "content-type: application/json" -d "{}"
# 期望返回 500 + {"error":"prompt-polish: 输入文本为空"}（说明接口已注册）
curl http://127.0.0.1:8080/pp-api/logs
# 期望返回 {"logs":[...],"health":{...}}
```

## 🗑 卸载

1. 删除 `cordis.patch.yml` 中追加的 `prompt-polish` insert 块
2. 删除 `node_modules` 下的 `prompt-polish` 目录
3. 重启 dsh 即可

## ⚙️ 模型路由

插件优先使用 `agentDefaultModel`（dsh 的默认模型选择，即 Models 设置页/`$DSH_HOME/settings.yaml` 中 `agent-default-model` 配置）；若不可用则回退到第一个已注册 provider 的首个模型。每次请求读取，无需重启。

## 📄 许可证

[MIT](./LICENSE)

---

*本项目与 DeepSeek 官方无关联，是 dsh 生态的社区插件。*
