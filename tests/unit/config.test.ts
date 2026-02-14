import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `config-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", async () => {
    const config = await loadConfig(tmpDir);
    expect(config.codex_model).toBe("o4-mini");
    expect(config.default_concurrency).toBe(2);
    expect(config.default_timeout_sec).toBe(300);
    expect(config.codex_full_auto).toBe(true);
    expect(config.codex_ephemeral).toBe(true);
    expect(config.sandbox_mode).toBe("workspace-write");
  });

  it("reads partial config and applies defaults", async () => {
    await writeFile(join(tmpDir, ".mcp-codex.json"), JSON.stringify({
      codex_model: "gpt-4.1",
      default_concurrency: 4,
    }));
    const config = await loadConfig(tmpDir);
    expect(config.codex_model).toBe("gpt-4.1");
    expect(config.default_concurrency).toBe(4);
    // Defaults still applied
    expect(config.default_timeout_sec).toBe(300);
    expect(config.sandbox_mode).toBe("workspace-write");
  });

  it("reads full config file", async () => {
    await writeFile(join(tmpDir, ".mcp-codex.json"), JSON.stringify({
      allowed_commands: ["npm test"],
      default_allowed_paths: ["src/**"],
      default_concurrency: 3,
      default_timeout_sec: 600,
      resource_policy: "normal",
      network_policy: "allow",
      codex_command: "codex",
      codex_model: "gpt-4.1",
      codex_full_auto: false,
      codex_ephemeral: false,
      sandbox_mode: "read-only",
      max_runs_retained: 10,
      max_tasks_per_run: 5,
    }));
    const config = await loadConfig(tmpDir);
    expect(config.codex_full_auto).toBe(false);
    expect(config.sandbox_mode).toBe("read-only");
    expect(config.max_tasks_per_run).toBe(5);
  });

  it("throws on invalid config", async () => {
    await writeFile(join(tmpDir, ".mcp-codex.json"), JSON.stringify({
      default_concurrency: -1, // Invalid: min is 1
    }));
    await expect(loadConfig(tmpDir)).rejects.toThrow();
  });

  it("throws on invalid JSON", async () => {
    await writeFile(join(tmpDir, ".mcp-codex.json"), "not json {{{");
    await expect(loadConfig(tmpDir)).rejects.toThrow();
  });
});
