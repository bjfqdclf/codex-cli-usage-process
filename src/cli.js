import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  createSampleUserConfig,
  defaultUserConfigPath,
  loadPluginConfig,
  resolveUserConfigPath,
} from "./config.js";
import {
  installIntoCodexConfig,
  uninstallFromCodexConfig,
} from "./installer.js";
import { startMcpServer } from "./mcp.js";
import { fetchUsageSnapshot } from "./usage.js";
import {
  formatStatusLine,
  renderSnapshotBlock,
  renderSnapshotJson,
} from "./view.js";

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? "help";
  const options = {};

  while (args.length > 0) {
    const token = args.shift();
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = args[0];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = args.shift();
  }

  return { command, options };
}

function printHelp() {
  console.log(`codex-usage-plugin

命令:
  install              安装到 ~/.codex/config.toml
  uninstall            从 ~/.codex/config.toml 卸载
  status               输出单行额度状态
  watch                实时刷新终端面板
  json                 输出 JSON 快照
  validate-config      校验插件配置
  init-config          生成示例配置
  mcp                  以 MCP stdio 服务运行

常用参数:
  --config <path>      指定插件配置文件
  --interval <sec>     watch 模式刷新间隔
  --once               watch 只渲染一次
  --codex-config <p>   指定 Codex config.toml
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadSnapshot(options) {
  const config = await loadPluginConfig(options.config);
  return fetchUsageSnapshot(config);
}

async function commandStatus(options) {
  const snapshot = await loadSnapshot(options);
  console.log(formatStatusLine(snapshot));
}

async function commandJson(options) {
  const snapshot = await loadSnapshot(options);
  console.log(JSON.stringify(renderSnapshotJson(snapshot), null, 2));
}

async function commandWatch(options) {
  const config = await loadPluginConfig(options.config);
  const intervalSeconds = Number(options.interval ?? config.refreshIntervalSeconds ?? 60);
  const once = Boolean(options.once);

  while (true) {
    const snapshot = await fetchUsageSnapshot(config);
    process.stdout.write("\x1Bc");
    console.log(renderSnapshotBlock(snapshot));
    if (once) {
      return;
    }
    await sleep(intervalSeconds * 1000);
  }
}

async function commandValidateConfig(options) {
  const config = await loadPluginConfig(options.config);
  console.log(`配置有效: ${config.meta.configPath}`);
}

async function commandInitConfig(options) {
  const targetPath = resolveUserConfigPath(options.config);
  await createSampleUserConfig(targetPath);
  console.log(`已生成示例配置: ${targetPath}`);
}

async function commandInstall(options) {
  const config = await loadPluginConfig(options.config);
  const codexConfigPath =
    typeof options["codex-config"] === "string"
      ? path.resolve(options["codex-config"])
      : path.join(os.homedir(), ".codex", "config.toml");

  await installIntoCodexConfig({
    codexConfigPath,
    pluginCommand: path.resolve(process.argv[1]),
    pluginConfigPath: config.meta.configPath,
  });

  console.log(`已安装到 Codex CLI: ${codexConfigPath}`);
  console.log(`插件配置: ${config.meta.configPath}`);
  console.log("说明: 官方 Codex CLI 当前没有公开的内嵌下方面板接口，已安装为 MCP + 终端面板能力。");
}

async function commandUninstall(options) {
  const codexConfigPath =
    typeof options["codex-config"] === "string"
      ? path.resolve(options["codex-config"])
      : path.join(os.homedir(), ".codex", "config.toml");
  await uninstallFromCodexConfig({ codexConfigPath });
  console.log(`已从 Codex CLI 卸载: ${codexConfigPath}`);
}

export async function runCli(argv) {
  const { command, options } = parseArgs(argv);

  switch (command) {
    case "install":
      await commandInstall(options);
      return;
    case "uninstall":
      await commandUninstall(options);
      return;
    case "status":
      await commandStatus(options);
      return;
    case "watch":
      await commandWatch(options);
      return;
    case "json":
      await commandJson(options);
      return;
    case "validate-config":
      await commandValidateConfig(options);
      return;
    case "init-config":
      await commandInitConfig(options);
      return;
    case "mcp":
      await startMcpServer(options.config);
      return;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      throw new Error(`未知命令: ${command}`);
  }
}

export { defaultUserConfigPath };
