import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function defaultUserConfigPath() {
  return path.join(os.homedir(), ".codex", "codex-usage-plugin.json");
}

export function resolveUserConfigPath(explicitPath) {
  if (typeof explicitPath === "string" && explicitPath.trim() !== "") {
    return path.resolve(explicitPath);
  }
  return defaultUserConfigPath();
}

export async function createSampleUserConfig(targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const sample = {
    mode: "codex-local",
    codex: {
      rpcCommand: "codex",
      rpcArgs: ["-s", "read-only", "-a", "untrusted", "app-server"],
      rpcTimeoutMs: 8000,
      authPath: "~/.codex/auth.json",
      configPath: "~/.codex/config.toml"
    },
    refreshIntervalSeconds: 60,
    genericEndpoint: {
      url: "https://example.com/api/codex/usage",
      method: "GET",
      headers: {
        Authorization: "Bearer replace-me"
      }
    },
    windows: [
      {
        key: "five_hour",
        label: "5小时",
        usedPath: "data.five_hour.used",
        limitPath: "data.five_hour.limit",
        resetAtPath: "data.five_hour.reset_at"
      },
      {
        key: "weekly",
        label: "1周",
        usedPath: "data.weekly.used",
        limitPath: "data.weekly.limit",
        resetAtPath: "data.weekly.reset_at"
      }
    ]
  };
  await fs.writeFile(targetPath, `${JSON.stringify(sample, null, 2)}\n`, "utf8");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} 必须是非空字符串`);
  }
}

export async function loadPluginConfig(explicitPath) {
  const configPath = resolveUserConfigPath(explicitPath);
  let raw;
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`未找到插件配置文件: ${configPath}。先执行 init-config。`);
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`插件配置不是合法 JSON: ${configPath}`);
  }

  const mode = String(parsed.mode ?? (parsed.endpoint ? "generic-endpoint" : "codex-local"));
  const refreshIntervalSeconds = Number(parsed.refreshIntervalSeconds ?? 60);

  if (mode === "codex-local" || mode === "codex-oauth") {
    return {
      mode,
      codex: {
        rpcCommand: typeof parsed.codex?.rpcCommand === "string" ? parsed.codex.rpcCommand : "codex",
        rpcArgs: Array.isArray(parsed.codex?.rpcArgs) ? parsed.codex.rpcArgs : null,
        rpcTimeoutMs:
          parsed.codex?.rpcTimeoutMs === undefined ? 8000 : Number(parsed.codex.rpcTimeoutMs),
        authPath: typeof parsed.codex?.authPath === "string" ? parsed.codex.authPath : null,
        configPath: typeof parsed.codex?.configPath === "string" ? parsed.codex.configPath : null,
        chatgptBaseUrl:
          typeof parsed.codex?.chatgptBaseUrl === "string" ? parsed.codex.chatgptBaseUrl : null,
      },
      refreshIntervalSeconds,
      meta: {
        configPath,
      },
    };
  }

  const endpoint = parsed.genericEndpoint ?? parsed.endpoint;
  if (!isObject(endpoint)) {
    throw new Error("genericEndpoint 配置缺失");
  }
  assertString(endpoint.url, "genericEndpoint.url");

  if (!Array.isArray(parsed.windows) || parsed.windows.length === 0) {
    throw new Error("genericEndpoint 模式下 windows 至少需要 1 个额度窗口");
  }

  parsed.windows.forEach((item, index) => {
    if (!isObject(item)) {
      throw new Error(`windows[${index}] 必须是对象`);
    }
    assertString(item.key, `windows[${index}].key`);
    assertString(item.label, `windows[${index}].label`);
    assertString(item.usedPath, `windows[${index}].usedPath`);
    assertString(item.limitPath, `windows[${index}].limitPath`);
    assertString(item.resetAtPath, `windows[${index}].resetAtPath`);
  });

  return {
    mode: "generic-endpoint",
    endpoint: {
      url: endpoint.url,
      method: String(endpoint.method ?? "GET").toUpperCase(),
      headers: isObject(endpoint.headers) ? endpoint.headers : {},
      body: endpoint.body ?? null,
    },
    refreshIntervalSeconds,
    windows: parsed.windows,
    meta: {
      configPath,
    },
  };
}
