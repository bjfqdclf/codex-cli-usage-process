function padBar(ratio, width = 24) {
  const filled = Math.round(width * ratio);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(width - filled, 0))}`;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatResetAt(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function renderSnapshotBlock(snapshot) {
  const lines = [
    "Codex CLI 用量面板",
    `更新时间: ${formatResetAt(snapshot.fetchedAt)}`,
    `来源: ${snapshot.sourceUrl}`,
  ];

  if (snapshot.planType) {
    lines.push(`套餐: ${snapshot.planType}`);
  }
  if (snapshot.accountEmail) {
    lines.push(`账号: ${snapshot.accountEmail}`);
  }
  if (snapshot.creditsBalance !== null && snapshot.creditsBalance !== undefined) {
    lines.push(`Credits: ${formatNumber(snapshot.creditsBalance)}`);
  }
  lines.push("");

  snapshot.windows.forEach((item) => {
    const percent = `${(item.ratio * 100).toFixed(1)}%`;
    const usedLabel =
      item.unit === "%" ? `${formatNumber(item.used)}%` : `${formatNumber(item.used)}/${formatNumber(item.limit)}`;
    lines.push(
      `${item.label.padEnd(6, " ")} ${padBar(item.ratio)} ${percent}  ${usedLabel}`
    );
    lines.push(`重置时间: ${formatResetAt(item.resetAt)}`);
    lines.push("");
  });

  lines.push("说明: 官方 Codex CLI 当前不支持把第三方进度条稳定嵌入对话框底部。");
  return lines.join("\n");
}

export function formatStatusLine(snapshot) {
  const core = snapshot.windows
    .map((item) => {
      const percent = `${(item.ratio * 100).toFixed(1)}%`;
      const usedLabel =
        item.unit === "%" ? `${formatNumber(item.used)}%` : `${formatNumber(item.used)}/${formatNumber(item.limit)}`;
      return `${item.label} ${usedLabel} (${percent}, 重置 ${formatResetAt(item.resetAt)})`;
    })
    .join(" | ");
  const extras = [];
  if (snapshot.planType) {
    extras.push(`套餐 ${snapshot.planType}`);
  }
  if (snapshot.accountEmail) {
    extras.push(`账号 ${snapshot.accountEmail}`);
  }
  if (snapshot.creditsBalance !== null && snapshot.creditsBalance !== undefined) {
    extras.push(`Credits ${formatNumber(snapshot.creditsBalance)}`);
  }
  return extras.length > 0 ? `${extras.join(" | ")} | ${core}` : core;
}

export function renderSnapshotJson(snapshot) {
  return {
    fetchedAt: snapshot.fetchedAt,
    sourceUrl: snapshot.sourceUrl,
    windows: snapshot.windows.map((item) => ({
      ...item,
      percent: Number((item.ratio * 100).toFixed(2)),
    })),
    statusLine: formatStatusLine(snapshot),
  };
}
