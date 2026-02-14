export class CodexRunnerError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CodexRunnerError";
  }
}

export class SecurityError extends CodexRunnerError {
  constructor(message: string) {
    super(message, "SECURITY_VIOLATION");
    this.name = "SecurityError";
  }
}

export class TimeoutError extends CodexRunnerError {
  constructor(message: string, public readonly timeout_ms: number) {
    super(message, "TIMEOUT");
    this.name = "TimeoutError";
  }
}

export class CodexError extends CodexRunnerError {
  constructor(message: string, public readonly exitCode: number | null) {
    super(message, "CODEX_FAILED");
    this.name = "CodexError";
  }
}

export class PatchError extends CodexRunnerError {
  constructor(message: string) {
    super(message, "PATCH_INVALID");
    this.name = "PatchError";
  }
}

export class StartupError extends CodexRunnerError {
  constructor(message: string) {
    super(message, "STARTUP_FAILED");
    this.name = "StartupError";
  }
}

export class InputValidationError extends CodexRunnerError {
  constructor(message: string) {
    super(message, "INPUT_INVALID");
    this.name = "InputValidationError";
  }
}

export class WorktreeError extends CodexRunnerError {
  constructor(message: string) {
    super(message, "WORKTREE_FAILED");
    this.name = "WorktreeError";
  }
}

export class ParserError extends CodexRunnerError {
  constructor(message: string) {
    super(message, "PARSER_FAILED");
    this.name = "ParserError";
  }
}
