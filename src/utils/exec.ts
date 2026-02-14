import { spawn } from "node:child_process";
import type { ExecOptions, ExecResult } from "../types.js";

const DEFAULT_MAX_BUFFER = 1 * 1024 * 1024; // 1MB

export async function exec(
  cmd: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd, timeout_ms, env, signal, maxBuffer = DEFAULT_MAX_BUFFER } = options;

  return new Promise<ExecResult>((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: env as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    let stdout = "";
    let stderr = "";
    let stdoutLen = 0;
    let stderrLen = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    child.stdout?.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      if (stdoutLen + str.length <= maxBuffer) {
        stdout += str;
        stdoutLen += str.length;
      } else if (!stdoutTruncated) {
        stdoutTruncated = true;
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      if (stderrLen + str.length <= maxBuffer) {
        stderr += str;
        stderrLen += str.length;
      } else if (!stderrTruncated) {
        stderrTruncated = true;
      }
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (timeout_ms && timeout_ms > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        // Force kill after 5 seconds if still alive
        killTimer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 5000);
      }, timeout_ms);
    }

    child.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killTimer) clearTimeout(killTimer);
      if (stdoutTruncated) stdout += "\n[OUTPUT TRUNCATED]";
      if (stderrTruncated) stderr += "\n[OUTPUT TRUNCATED]";
      resolve({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
      });
    });

    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        stdout,
        stderr: stderr + "\n" + err.message,
        exitCode: null,
        timedOut,
      });
    });
  });
}
