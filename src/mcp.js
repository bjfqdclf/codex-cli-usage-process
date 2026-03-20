import readline from "node:readline";
import { loadPluginConfig } from "./config.js";
import { fetchUsageSnapshot } from "./usage.js";
import { renderSnapshotJson } from "./view.js";

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handleToolCall(config, request) {
  const name = request.params?.name;
  if (name !== "get_usage_snapshot") {
    return {
      content: [{ type: "text", text: `未知工具: ${name}` }],
      isError: true,
    };
  }

  const snapshot = await fetchUsageSnapshot(config);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(renderSnapshotJson(snapshot), null, 2),
      },
    ],
  };
}

export async function startMcpServer(explicitConfigPath) {
  const config = await loadPluginConfig(explicitConfigPath);
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  rl.on("line", async (line) => {
    if (!line.trim()) {
      return;
    }

    let request;
    try {
      request = JSON.parse(line);
    } catch {
      return;
    }

    try {
      if (request.method === "initialize") {
        writeMessage({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "codex-usage-plugin",
              version: "0.1.0",
            },
          },
        });
        return;
      }

      if (request.method === "notifications/initialized") {
        return;
      }

      if (request.method === "tools/list") {
        writeMessage({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: [
              {
                name: "get_usage_snapshot",
                description: "获取 Codex CLI 额度用量与重置时间",
                inputSchema: {
                  type: "object",
                  properties: {},
                },
              },
            ],
          },
        });
        return;
      }

      if (request.method === "tools/call") {
        const result = await handleToolCall(config, request);
        writeMessage({
          jsonrpc: "2.0",
          id: request.id,
          result,
        });
        return;
      }

      writeMessage({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: `不支持的方法: ${request.method}`,
        },
      });
    } catch (error) {
      writeMessage({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
