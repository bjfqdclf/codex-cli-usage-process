import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  if (inputPath === "~") {
    return os.homedir();
  }
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function defaultCodexRoot() {
  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome) {
    return codexHome;
  }
  return path.join(os.homedir(), ".codex");
}

function normalizeBaseUrl(value) {
  let normalized = (value || "https://chatgpt.com/backend-api").trim();
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  if (
    (normalized.startsWith("https://chatgpt.com") ||
      normalized.startsWith("https://chat.openai.com")) &&
    !normalized.includes("/backend-api")
  ) {
    normalized = `${normalized}/backend-api`;
  }
  return normalized;
}

function resolveUsageUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  const pathSuffix = normalized.includes("/backend-api") ? "/wham/usage" : "/api/codex/usage";
  return `${normalized}${pathSuffix}`;
}

function parseChatGPTBaseURLFromToml(contents) {
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line) {
      continue;
    }
    const match = line.match(/^chatgpt_base_url\s*=\s*["']?(.+?)["']?$/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

async function loadAuthFile(authPath) {
  const raw = await fs.readFile(authPath, "utf8");
  const json = JSON.parse(raw);

  if (typeof json.OPENAI_API_KEY === "string" && json.OPENAI_API_KEY.trim()) {
    return {
      accessToken: json.OPENAI_API_KEY.trim(),
      accountId: null,
    };
  }

  const tokens = json.tokens ?? {};
  if (typeof tokens.access_token !== "string" || !tokens.access_token.trim()) {
    throw new Error("~/.codex/auth.json 缺少 access_token，请先运行 codex 登录。");
  }

  return {
    accessToken: tokens.access_token.trim(),
    accountId: typeof tokens.account_id === "string" && tokens.account_id.trim()
      ? tokens.account_id.trim()
      : null,
  };
}

export async function fetchCodexOAuthSnapshot(config) {
  const codexRoot = defaultCodexRoot();
  const authPath = path.resolve(expandHome(config.codex?.authPath ?? path.join(codexRoot, "auth.json")));
  const configPath = path.resolve(
    expandHome(config.codex?.configPath ?? path.join(codexRoot, "config.toml"))
  );

  const auth = await loadAuthFile(authPath);

  let chatgptBaseUrl = config.codex?.chatgptBaseUrl ?? null;
  if (!chatgptBaseUrl) {
    try {
      const toml = await fs.readFile(configPath, "utf8");
      chatgptBaseUrl = parseChatGPTBaseURLFromToml(toml);
    } catch {}
  }

  const sourceUrl = resolveUsageUrl(chatgptBaseUrl ?? "https://chatgpt.com/backend-api");
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    Accept: "application/json",
    "User-Agent": "codex-usage-plugin",
  };
  if (auth.accountId) {
    headers["ChatGPT-Account-Id"] = auth.accountId;
  }

  const response = await fetch(sourceUrl, {
    method: "GET",
    headers,
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Codex OAuth 凭证已过期或无效，请重新执行 codex 登录。");
  }
  if (!response.ok) {
    throw new Error(`Codex 用量接口请求失败: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const primaryWindow = payload?.rate_limit?.primary_window ?? null;
  const secondaryWindow = payload?.rate_limit?.secondary_window ?? null;

  const windows = [
    primaryWindow
      ? {
          key: "five_hour",
          label: "5小时",
          used: Number(primaryWindow.used_percent ?? 0),
          limit: 100,
          ratio: Number(primaryWindow.used_percent ?? 0) / 100,
          resetAt: new Date(Number(primaryWindow.reset_at ?? 0) * 1000).toISOString(),
          unit: "%",
          windowMinutes: Number(primaryWindow.limit_window_seconds ?? 0) / 60,
        }
      : null,
    secondaryWindow
      ? {
          key: "weekly",
          label: "1周",
          used: Number(secondaryWindow.used_percent ?? 0),
          limit: 100,
          ratio: Number(secondaryWindow.used_percent ?? 0) / 100,
          resetAt: new Date(Number(secondaryWindow.reset_at ?? 0) * 1000).toISOString(),
          unit: "%",
          windowMinutes: Number(secondaryWindow.limit_window_seconds ?? 0) / 60,
        }
      : null,
  ].filter(Boolean);

  if (windows.length === 0) {
    throw new Error("Codex 用量接口返回成功，但没有解析到 5 小时或周额度窗口。");
  }

  return {
    fetchedAt: new Date().toISOString(),
    sourceUrl,
    planType: payload?.plan_type ?? null,
    creditsBalance:
      payload?.credits?.balance === null || payload?.credits?.balance === undefined
        ? null
        : Number(payload.credits.balance),
    accountEmail: null,
    windows,
  };
}
