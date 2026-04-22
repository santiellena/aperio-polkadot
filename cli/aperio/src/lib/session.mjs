import fs from "node:fs/promises";
import { getConfig } from "./config.mjs";

export async function readSession() {
  const { sessionPath } = getConfig();
  try {
    const text = await fs.readFile(sessionPath, "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeSession(session) {
  const { sessionPath, stateDir } = getConfig();
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  return sessionPath;
}

export async function clearSession() {
  const { sessionPath } = getConfig();
  await fs.rm(sessionPath, { force: true }).catch(() => undefined);
}

export async function requireSession() {
  const session = await readSession();
  if (!session) {
    throw new Error("No signer configured. Run `aperio import <suri>` first.");
  }
  return session;
}
