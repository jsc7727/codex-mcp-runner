import { describe, it, expect } from "vitest";
import {
  CodexRunnerError, SecurityError, TimeoutError, CodexError,
  PatchError, StartupError, InputValidationError, WorktreeError, ParserError
} from "../../src/errors.js";

describe("Error hierarchy", () => {
  it("SecurityError extends CodexRunnerError", () => {
    const err = new SecurityError("test");
    expect(err).toBeInstanceOf(CodexRunnerError);
    expect(err).toBeInstanceOf(SecurityError);
    expect(err.code).toBe("SECURITY_VIOLATION");
    expect(err.name).toBe("SecurityError");
  });

  it("TimeoutError includes timeout value", () => {
    const err = new TimeoutError("test", 30000);
    expect(err).toBeInstanceOf(CodexRunnerError);
    expect(err.timeout_ms).toBe(30000);
    expect(err.code).toBe("TIMEOUT");
  });

  it("CodexError includes exit code", () => {
    const err = new CodexError("test", 1);
    expect(err).toBeInstanceOf(CodexRunnerError);
    expect(err.exitCode).toBe(1);
    expect(err.code).toBe("CODEX_FAILED");
  });

  it("all error types have correct codes", () => {
    expect(new PatchError("t").code).toBe("PATCH_INVALID");
    expect(new StartupError("t").code).toBe("STARTUP_FAILED");
    expect(new InputValidationError("t").code).toBe("INPUT_INVALID");
    expect(new WorktreeError("t").code).toBe("WORKTREE_FAILED");
    expect(new ParserError("t").code).toBe("PARSER_FAILED");
  });

  it("all errors are instances of Error", () => {
    const errors = [
      new SecurityError("t"), new TimeoutError("t", 1000),
      new CodexError("t", 1), new PatchError("t"),
      new StartupError("t"), new InputValidationError("t"),
      new WorktreeError("t"), new ParserError("t"),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("t");
    }
  });
});
