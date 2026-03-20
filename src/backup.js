import fs from "node:fs/promises";
import path from "node:path";

function timestamp() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

export async function backupFile(filePath) {
  const directory = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const backupDirectory = path.join(directory, ".codex-backups");
  await fs.mkdir(backupDirectory, { recursive: true });

  const target = path.join(backupDirectory, `${baseName}.${timestamp()}`);
  await fs.copyFile(filePath, target);

  const entries = await fs.readdir(backupDirectory, { withFileTypes: true });
  const related = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${baseName}.`))
    .sort((left, right) => right.name.localeCompare(left.name));

  await Promise.all(
    related.slice(20).map((entry) => fs.rm(path.join(backupDirectory, entry.name), { force: true }))
  );

  return target;
}
