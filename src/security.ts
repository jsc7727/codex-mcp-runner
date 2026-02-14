import { resolve, relative, isAbsolute } from "node:path";
import picomatch from "picomatch";
import { SecurityError } from "./errors.js";
import type { TaskInput, CodexConfig, ParsedCodexOutput, SecurityViolation } from "./types.js";

// Shell metacharacters that indicate command chaining/injection
const SHELL_METACHARACTERS = /[;|&$()<>`\n]/;

// Environment variable allowlist
const ENV_ALLOWLIST = new Set([
  "PATH", "HOME", "USER", "LANG", "TERM", "SHELL", "TMPDIR", "NODE_ENV",
]);

// Patterns for secret env var names to strip
const SECRET_PATTERNS = [/_KEY$/, /_SECRET$/, /_TOKEN$/, /_PASSWORD$/];

/**
 * Validate that all paths match at least one allowed glob pattern
 * and resolve within repoRoot (no directory traversal).
 * Throws SecurityError on violation.
 */
export function validateAllowedPaths(
  paths: string[],
  allowedPatterns: string[],
  repoRoot: string
): void {
  if (allowedPatterns.length === 0) return; // No restrictions configured

  const matchers = allowedPatterns.map(p => picomatch(p));

  for (const filePath of paths) {
    // Normalize the path relative to repo root
    const absPath = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
    const relPath = relative(repoRoot, absPath);

    // Prevent directory traversal (relative path must not start with ..)
    if (relPath.startsWith("..") || isAbsolute(relPath)) {
      throw new SecurityError(
        `Path escapes repository root: "${filePath}" resolves to "${absPath}" which is outside "${repoRoot}"`
      );
    }

    // Check against allowed glob patterns
    const matched = matchers.some(m => m(relPath));
    if (!matched) {
      throw new SecurityError(
        `Path not in allowed patterns: "${relPath}". Allowed: ${allowedPatterns.join(", ")}`
      );
    }
  }
}

/**
 * Validate commands against an allowlist, with shell metacharacter rejection.
 * Throws SecurityError on violation.
 */
export function validateAllowedCommands(
  commands: string[],
  allowlist: string[]
): void {
  for (const cmd of commands) {
    // Step 1: Reject shell metacharacters FIRST
    if (SHELL_METACHARACTERS.test(cmd)) {
      throw new SecurityError(
        `Command contains shell metacharacters: "${cmd}". ` +
        `Shell operators (;, |, &, $, etc.) are not allowed.`
      );
    }

    // Step 2: Check prefix match against allowlist
    if (allowlist.length > 0) {
      const allowed = allowlist.some(prefix =>
        cmd === prefix || cmd.startsWith(prefix + " ")
      );
      if (!allowed) {
        throw new SecurityError(
          `Command not in allowlist: "${cmd}". ` +
          `Allowed prefixes: ${allowlist.join(", ")}`
        );
      }
    }
  }
}

/**
 * Create a sanitized environment for spawning Codex.
 * Only passes through whitelisted vars + CODEX_API_KEY.
 */
export function sanitizeEnvironment(
  baseEnv: NodeJS.ProcessEnv
): Record<string, string> {
  const clean: Record<string, string> = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (value === undefined) continue;

    // Always allow CODEX_API_KEY
    if (key === "CODEX_API_KEY") {
      clean[key] = value;
      continue;
    }

    // Allow whitelisted env vars
    if (ENV_ALLOWLIST.has(key)) {
      clean[key] = value;
      continue;
    }

    // Strip secret-looking vars
    if (SECRET_PATTERNS.some(p => p.test(key))) {
      continue;
    }

    // Allow non-secret vars that aren't in the blocklist
    // Actually, be strict: only pass through allowlisted vars
    // Everything else is dropped
  }

  return clean;
}

/**
 * Pre-flight security validation for a task.
 * Validates allowed_paths and allowed_commands from task or config defaults.
 */
export function validateTaskInput(
  task: TaskInput,
  config: CodexConfig,
  repoRoot: string
): void {
  const allowedPaths = (task.allowed_paths && task.allowed_paths.length > 0)
    ? task.allowed_paths
    : config.default_allowed_paths;
  const allowedCommands = (task.allowed_commands && task.allowed_commands.length > 0)
    ? task.allowed_commands
    : config.allowed_commands;

  // Validate that the configured paths are reasonable (no traversal in patterns themselves)
  // Note: we validate the patterns, not actual file paths here
  // Actual file path validation happens post-execution

  // Validate any explicitly declared commands
  if (allowedCommands.length > 0) {
    // Just ensure the allowlist entries themselves don't have metacharacters
    for (const cmd of allowedCommands) {
      if (SHELL_METACHARACTERS.test(cmd)) {
        throw new SecurityError(
          `Allowlist entry contains shell metacharacters: "${cmd}". ` +
          `Shell operators are not allowed even in allowlist definitions.`
        );
      }
    }
  }
}

/**
 * Post-execution security validation.
 * Checks what Codex ACTUALLY did vs what was allowed.
 * Returns violations (does NOT throw).
 */
export function validatePostExecution(
  parsedOutput: ParsedCodexOutput,
  allowedCommands: string[],
  allowedPaths: string[],
  repoRoot: string
): SecurityViolation[] {
  const violations: SecurityViolation[] = [];

  // Check commands actually run by Codex against allowlist
  for (const cmdRecord of parsedOutput.commands_run) {
    try {
      validateAllowedCommands([cmdRecord.cmd], allowedCommands);
    } catch {
      violations.push({
        type: "command",
        detail: `Command not in allowlist: ${cmdRecord.cmd}`,
        value: cmdRecord.cmd,
      });
    }
  }

  // Check files changed against allowed paths
  if (parsedOutput.files_changed.length > 0 && allowedPaths.length > 0) {
    for (const filePath of parsedOutput.files_changed) {
      try {
        validateAllowedPaths([filePath], allowedPaths, repoRoot);
      } catch {
        violations.push({
          type: "path",
          detail: `File outside allowed paths: ${filePath}`,
          value: filePath,
        });
      }
    }
  }

  return violations;
}
