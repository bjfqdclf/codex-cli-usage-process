# codex-cli-usage-process

一个用于展示 Codex CLI 额度使用情况的本地插件工具。

它会读取当前账号的真实用量数据，把 5 小时额度、周额度、重置时间和 credits 以终端面板、单行状态、JSON 快照和 MCP 工具的形式暴露出来。

## 一句话介绍

这是一个不修改 Codex CLI 本体、但能接入 Codex CLI 使用的“外挂式用量插件”。

## 首页摘要

- 读取真实 Codex 额度，不是手填假数据
- 默认优先走本机 `codex app-server`
- 支持终端实时面板、脚本状态输出、MCP 调用
- 支持一键安装 / 卸载
- 保留自定义 JSON 接口映射能力

## 它能做什么

- 优先通过本机 `codex app-server` 读取真实额度
- 本地 RPC 不可用时，回退到 `~/.codex/auth.json` 对应的真实用量接口
- 也支持自定义 JSON/OpenAPI 风格接口映射
- 可以输出终端实时面板、单行状态、JSON 快照
- 可以一键安装 / 卸载到 Codex CLI 的 `~/.codex/config.toml`

## 它不能做什么

- 不能直接修改 Codex CLI 本体界面
- 不能稳定嵌入官方对话框底部进度条
- 目前仍然依赖本地 CLI / MCP 方式接入

## 适合的场景

- 想快速知道 Codex 5 小时额度还剩多少
- 想知道周额度是否快用完
- 想把额度信息接到脚本、状态栏或其他工具里
- 想在 Codex CLI 中通过 MCP 读取当前用量

## 30 秒上手

```bash
node ./bin/codex-usage-plugin.js init-config
node ./bin/codex-usage-plugin.js validate-config
node ./bin/codex-usage-plugin.js status
node ./bin/codex-usage-plugin.js install
```

常用命令：

```bash
node ./bin/codex-usage-plugin.js status
node ./bin/codex-usage-plugin.js watch --interval 30
node ./bin/codex-usage-plugin.js json
```

## 工作方式

官方 Codex CLI 目前没有公开、稳定的第三方“对话框底部内嵌进度条”扩展接口。

所以这个项目采用的是可落地方案：

- 一个本地 CLI 工具
- 一个可安装到 Codex CLI 的 MCP server
- 一个实时刷新的终端面板
- 一个适合脚本调用的单行状态输出

## 数据来源

参考 `CodexBar` 的实现，项目默认使用下面这条链路读取真实额度：

### 首选：本机 Codex App Server

- 命令：`codex -s read-only -a untrusted app-server`
- 请求方法：`account/read`
- 请求方法：`account/rateLimits/read`

会读取到的关键信息包括：

- 当前账号邮箱
- 套餐类型
- 5 小时窗口已用百分比
- 1 周窗口已用百分比
- 各窗口重置时间
- credits 余额

## 输出形式

你可以把它当成 4 种东西来用：

- 一个终端命令：`status`
- 一个实时面板：`watch`
- 一个结构化接口：`json`
- 一个 Codex CLI MCP 工具：`get_usage_snapshot`

### 回退：本机登录凭证 + 用量接口

对应本地文件：

- `~/.codex/auth.json`
- `~/.codex/config.toml`

默认接口：

- `https://chatgpt.com/backend-api/wham/usage`

如果 `config.toml` 中的 `chatgpt_base_url` 不是 `backend-api` 风格，则会回退拼接：

- `/api/codex/usage`

## 快速开始

### 1. 初始化配置

```bash
node ./bin/codex-usage-plugin.js init-config
```

默认生成：

```text
~/.codex/codex-usage-plugin.json
```

### 2. 校验配置

```bash
node ./bin/codex-usage-plugin.js validate-config
```

### 3. 查看当前用量

单行状态：

```bash
node ./bin/codex-usage-plugin.js status
```

实时面板：

```bash
node ./bin/codex-usage-plugin.js watch --interval 30
```

JSON 快照：

```bash
node ./bin/codex-usage-plugin.js json
```

### 4. 安装到 Codex CLI

```bash
node ./bin/codex-usage-plugin.js install
```

### 5. 卸载

```bash
node ./bin/codex-usage-plugin.js uninstall
```

## 使用方式

### 终端面板模式

`watch` 命令适合放到一个单独终端、tmux pane 或分屏窗口里持续观察。

示例：

```bash
node ./bin/codex-usage-plugin.js watch --interval 60
```

它会周期性刷新，展示：

- 套餐类型
- 账号邮箱
- credits 余额
- 5 小时额度进度条
- 周额度进度条
- 各自重置时间

### 单行状态模式

`status` 适合给 shell 脚本、状态栏工具、Raycast、SketchyBar、Waybar 等场景使用。

示例：

```bash
node ./bin/codex-usage-plugin.js status
```

输出会类似：

```text
套餐 plus | 账号 you@example.com | Credits 12.75 | 5小时 21% (...) | 1周 57% (...)
```

### JSON 模式

如果你想自己接入别的工具，优先使用 `json`：

```bash
node ./bin/codex-usage-plugin.js json
```

返回内容包含：

- `fetchedAt`
- `sourceUrl`
- `planType`
- `accountEmail`
- `creditsBalance`
- `windows`
- `statusLine`

## 配置说明

初始化后会得到一个 JSON 配置文件，默认内容类似：

```json
{
  "mode": "codex-local",
  "codex": {
    "rpcCommand": "codex",
    "rpcArgs": ["-s", "read-only", "-a", "untrusted", "app-server"],
    "rpcTimeoutMs": 8000,
    "authPath": "~/.codex/auth.json",
    "configPath": "~/.codex/config.toml"
  },
  "refreshIntervalSeconds": 60,
  "genericEndpoint": {
    "url": "https://example.com/api/codex/usage",
    "method": "GET",
    "headers": {
      "Authorization": "Bearer replace-me"
    }
  },
  "windows": [
    {
      "key": "five_hour",
      "label": "5小时",
      "usedPath": "data.five_hour.used",
      "limitPath": "data.five_hour.limit",
      "resetAtPath": "data.five_hour.reset_at"
    },
    {
      "key": "weekly",
      "label": "1周",
      "usedPath": "data.weekly.used",
      "limitPath": "data.weekly.limit",
      "resetAtPath": "data.weekly.reset_at"
    }
  ]
}
```

### `mode` 可选值

- `codex-local`
  先走本机 `codex app-server`，失败后回退到 OAuth 接口
- `codex-oauth`
  直接读取本机凭证并请求真实 Codex 用量接口
- `generic-endpoint`
  使用自定义接口和字段映射

### `codex-local` 模式

推荐默认使用，最接近 `CodexBar` 的真实实现路径。

可配置项：

- `rpcCommand`
- `rpcArgs`
- `rpcTimeoutMs`
- `authPath`
- `configPath`

### `codex-oauth` 模式

适合本地 `app-server` 不稳定，但 `auth.json` 可用的情况。

依赖：

- `~/.codex/auth.json`
- `~/.codex/config.toml`

### `generic-endpoint` 模式

适合你有自定义额度接口，或者想接自己整理过的数据源。

关键字段：

- `genericEndpoint.url`
- `genericEndpoint.method`
- `genericEndpoint.headers`
- `windows[].usedPath`
- `windows[].limitPath`
- `windows[].resetAtPath`

说明：

- `usedPath` / `limitPath` / `resetAtPath` 是 JSON 路径
- `resetAtPath` 支持 ISO 时间字符串或毫秒时间戳

## 安装到 Codex CLI 后会发生什么

执行：

```bash
node ./bin/codex-usage-plugin.js install
```

程序会修改：

```text
~/.codex/config.toml
```

写入一个 MCP server 配置段，让 Codex CLI 能调用这个插件。

同时会遵守备份规则：

- 在同目录创建或复用 `.codex-backups`
- 修改前先备份原始配置
- 备份文件名带时间戳
- 仅保留最近 20 份备份

## MCP 能力

安装后，Codex CLI 会加载一个 MCP 工具：

- `get_usage_snapshot`

它会返回当前额度快照，适合在 Codex 会话里直接读取。

## 命令列表

```bash
node ./bin/codex-usage-plugin.js help
```

当前支持：

- `init-config`
- `validate-config`
- `status`
- `watch`
- `json`
- `install`
- `uninstall`
- `mcp`

## 目录结构

主要文件：

- `bin/codex-usage-plugin.js`
- `src/cli.js`
- `src/codex-rpc.js`
- `src/codex-oauth.js`
- `src/usage.js`
- `src/mcp.js`
- `src/installer.js`

## 简单总结

如果你只想直接用，推荐这几步：

```bash
node ./bin/codex-usage-plugin.js init-config
node ./bin/codex-usage-plugin.js validate-config
node ./bin/codex-usage-plugin.js status
node ./bin/codex-usage-plugin.js install
```

这样你就能：

- 在终端里看当前 Codex 额度
- 在脚本里读取单行状态
- 在 Codex CLI 里通过 MCP 调用额度快照

## 参考

- `CodexBar`：https://github.com/steipete/CodexBar
