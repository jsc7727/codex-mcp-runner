import { describe, it, expect } from "vitest";
import { validateEnvironment } from "../../src/startup.js";
import { CodexConfigSchema } from "../../src/types.js";
import { StartupError } from "../../src/errors.js";

const defaultConfig = CodexConfigSchema.parse({});

describe("validateEnvironment", () => {
  it("passes in dry-run mode (only checks git)", async () => {
    // This should pass since we're in a git repo with git installed
    await expect(validateEnvironment(defaultConfig, true)).resolves.toBeUndefined();
  });

  it("passes dry-run even with non-existent codex command", async () => {
    const config = { ...defaultConfig, codex_command: "nonexistent-codex-binary" };
    // Dry-run skips codex checks
    await expect(validateEnvironment(config, true)).resolves.toBeUndefined();
  });

  it("fails with non-existent codex command in non-dry-run mode", async () => {
    const config = { ...defaultConfig, codex_command: "nonexistent-codex-binary-xyz-12345" };
    await expect(validateEnvironment(config, false)).rejects.toThrow(StartupError);
  });
});
