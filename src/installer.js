import fs from "node:fs/promises";
import path from "node:path";
import { backupFile } from "./backup.js";

const START_MARKER = "# >>> codex-usage-plugin >>>";
const END_MARKER = "# <<< codex-usage-plugin <<<";

function renderPluginBlock({ pluginCommand, pluginConfigPath }) {
  const normalizedCommand = pluginCommand.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const normalizedConfig = pluginConfigPath.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `${START_MARKER}
[mcp_servers.codex_usage_plugin]
command = "${normalizedCommand}"
args = ["mcp", "--config", "${normalizedConfig}"]
${END_MARKER}`;
}

function stripPluginBlock(text) {
  const pattern = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, "g");
  return text.replace(pattern, "").trimEnd();
}

export async function installIntoCodexConfig({
  codexConfigPath,
  pluginCommand,
  pluginConfigPath,
}) {
  await fs.mkdir(path.dirname(codexConfigPath), { recursive: true });
  let current = "";
  let exists = true;
  try {
    current = await fs.readFile(codexConfigPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      exists = false;
    } else {
      throw error;
    }
  }

  if (exists) {
    await backupFile(codexConfigPath);
  }

  const withoutPlugin = stripPluginBlock(current);
  const next = `${withoutPlugin}${withoutPlugin ? "\n\n" : ""}${renderPluginBlock({
    pluginCommand,
    pluginConfigPath,
  })}\n`;
  await fs.writeFile(codexConfigPath, next, "utf8");
}

export async function uninstallFromCodexConfig({ codexConfigPath }) {
  const current = await fs.readFile(codexConfigPath, "utf8");
  await backupFile(codexConfigPath);
  const next = `${stripPluginBlock(current)}\n`;
  await fs.writeFile(codexConfigPath, next, "utf8");
}
