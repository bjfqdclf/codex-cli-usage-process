import { spawn } from "node:child_process";

function toIsoFromUnixSeconds(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return new Date(Number(value) * 1000).toISOString();
}

function mapWindow(window, fallbackKey, fallbackLabel) {
  if (!window) {
    return null;
  }
  return {
    key: fallbackKey,
    label: fallbackLabel,
    used: Number(window.usedPercent ?? 0),
    limit: 100,
    ratio: Number(window.usedPercent ?? 0) / 100,
    resetAt: toIsoFromUnixSeconds(window.resetsAt),
    unit: "%",
    windowMinutes: window.windowDurationMins ?? null,
  };
}

class AppServerClient {
  constructor(command, args, timeoutMs) {
    this.command = command;
    this.args = args;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
  }

  async connect() {
    this.child = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");

    this.child.stdout.on("data", (chunk) => {
      this.stdoutBuffer += chunk;
      this.flushStdout();
    });

    this.child.stderr.on("data", (chunk) => {
      this.stderrBuffer += chunk;
    });

    this.child.on("exit", (code) => {
      const reason = this.stderrBuffer.trim() || `app-server 已退出，退出码 ${code ?? "unknown"}`;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error(reason));
      }
      this.pending.clear();
    });

    this.child.on("error", (error) => {
      const reason = error instanceof Error ? error.message : String(error);
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error(reason));
      }
      this.pending.clear();
    });

    await this.request("initialize", {
      clientInfo: {
        name: "codex-usage-plugin",
        version: "0.1.0",
      },
      protocolVersion: "0.1.0",
    });
  }

  flushStdout() {
    while (true) {
      const index = this.stdoutBuffer.indexOf("\n");
      if (index === -1) {
        return;
      }
      const line = this.stdoutBuffer.slice(0, index).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(index + 1);
      if (!line) {
        continue;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(message, "id")) {
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) {
        continue;
      }
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  request(method, params) {
    if (!this.child) {
      throw new Error("app-server 未连接");
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`app-server 请求超时: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async close() {
    if (!this.child) {
      return;
    }
    this.child.stdin.end();
    await new Promise((resolve) => {
      this.child.once("exit", () => resolve());
      setTimeout(() => {
        this.child.kill("SIGTERM");
        resolve();
      }, 300);
    });
  }
}

export async function fetchCodexRpcSnapshot(config) {
  const rpcCommand = config.codex?.rpcCommand || "codex";
  const rpcArgs = Array.isArray(config.codex?.rpcArgs) && config.codex.rpcArgs.length > 0
    ? config.codex.rpcArgs
    : ["-s", "read-only", "-a", "untrusted", "app-server"];
  const timeoutMs = Number(config.codex?.rpcTimeoutMs ?? 8000);

  const client = new AppServerClient(rpcCommand, rpcArgs, timeoutMs);
  try {
    await client.connect();
    const [accountResult, limitsResult] = await Promise.all([
      client.request("account/read", {}),
      client.request("account/rateLimits/read"),
    ]);

    const rateLimits = limitsResult?.rateLimitsByLimitId?.codex ?? limitsResult?.rateLimits ?? null;
    if (!rateLimits) {
      throw new Error("app-server 返回成功，但没有 rateLimits 数据。");
    }

    const windows = [
      mapWindow(rateLimits.primary, "five_hour", "5小时"),
      mapWindow(rateLimits.secondary, "weekly", "1周"),
    ].filter((item) => item && item.resetAt);

    if (windows.length === 0) {
      throw new Error("app-server 返回成功，但没有解析到额度窗口。");
    }

    const account = accountResult?.account ?? null;
    const planType =
      rateLimits.planType ||
      (account?.type === "chatgpt" ? account.planType : null) ||
      null;
    const creditsBalance = rateLimits.credits?.balance ? Number(rateLimits.credits.balance) : null;
    const accountEmail = account?.type === "chatgpt" ? account.email : null;

    return {
      fetchedAt: new Date().toISOString(),
      sourceUrl: `stdio:${rpcCommand} ${rpcArgs.join(" ")}`,
      planType,
      creditsBalance,
      accountEmail,
      windows,
    };
  } finally {
    await client.close();
  }
}
