import { fetchCodexRpcSnapshot } from "./codex-rpc.js";
import { fetchCodexOAuthSnapshot } from "./codex-oauth.js";

function readPath(source, dottedPath) {
  return dottedPath.split(".").reduce((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return current[segment];
  }, source);
}

function toNumber(value, name) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${name} 不是有效数字`);
  }
  return numeric;
}

function normalizeResetAt(value, name) {
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim() !== "") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  throw new Error(`${name} 不是有效时间`);
}

export async function fetchUsageSnapshot(config) {
  if (config.mode === "codex-local") {
    try {
      return await fetchCodexRpcSnapshot(config);
    } catch (rpcError) {
      try {
        return await fetchCodexOAuthSnapshot(config);
      } catch {
        throw rpcError;
      }
    }
  }

  if (config.mode === "codex-oauth") {
    return fetchCodexOAuthSnapshot(config);
  }

  const init = {
    method: config.endpoint.method,
    headers: {
      "content-type": "application/json",
      ...config.endpoint.headers,
    },
  };

  if (config.endpoint.body !== null && config.endpoint.body !== undefined) {
    init.body = JSON.stringify(config.endpoint.body);
  }

  const response = await fetch(config.endpoint.url, init);
  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const windows = config.windows.map((windowConfig) => {
    const used = toNumber(readPath(payload, windowConfig.usedPath), `${windowConfig.label}.used`);
    const limit = toNumber(readPath(payload, windowConfig.limitPath), `${windowConfig.label}.limit`);
    const resetAt = normalizeResetAt(
      readPath(payload, windowConfig.resetAtPath),
      `${windowConfig.label}.resetAt`
    );
    const ratio = limit <= 0 ? 0 : Math.min(used / limit, 1);
    return {
      key: windowConfig.key,
      label: windowConfig.label,
      used,
      limit,
      ratio,
      resetAt,
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    sourceUrl: config.endpoint.url,
    planType: null,
    creditsBalance: null,
    accountEmail: null,
    windows,
  };
}
