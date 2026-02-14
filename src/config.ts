import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CodexConfigSchema } from "./types.js";
import type { CodexConfig } from "./types.js";

const CONFIG_FILENAME = ".mcp-codex.json";

export async function loadConfig(cwd?: string): Promise<CodexConfig> {
  const configPath = resolve(cwd || process.cwd(), CONFIG_FILENAME);

  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return CodexConfigSchema.parse(parsed);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      // No config file -- use defaults
      return CodexConfigSchema.parse({});
    }
    throw err;
  }
}
