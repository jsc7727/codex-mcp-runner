import { exec } from "./utils/exec.js";
import { StartupError } from "./errors.js";
import type { CodexConfig } from "./types.js";

const MIN_CODEX_VERSION = "0.1.0";

function parseVersion(versionOutput: string): string | null {
  // Extract version number from output like "codex 0.101.0" or "0.101.0"
  const match = versionOutput.match(/(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export async function validateEnvironment(
  config: CodexConfig,
  isDryRun: boolean = false
): Promise<void> {
  // Check 1: git available
  const gitResult = await exec("git", ["--version"]);
  if (gitResult.exitCode !== 0) {
    throw new StartupError("git is not installed or not in PATH.");
  }

  // Check 2: CWD is a git repository
  const gitRepoResult = await exec("git", ["rev-parse", "--is-inside-work-tree"]);
  if (gitRepoResult.exitCode !== 0) {
    throw new StartupError(
      "Current working directory is not a git repository. Worktree operations require a git repo."
    );
  }

  // Checks 3-5 are skipped in dry-run mode
  if (isDryRun) return;

  // Check 3: codex CLI in PATH
  const codexResult = await exec(config.codex_command, ["--version"]);
  if (codexResult.exitCode !== 0) {
    throw new StartupError(
      `Codex CLI not found (command: "${config.codex_command}"). Install with: npm install -g @openai/codex`
    );
  }

  // Check 4: Codex CLI minimum version
  const version = parseVersion(codexResult.stdout + codexResult.stderr);
  if (version && compareVersions(version, MIN_CODEX_VERSION) < 0) {
    throw new StartupError(
      `Codex CLI version ${version} is below minimum ${MIN_CODEX_VERSION}. ` +
      `Update with: npm install -g @openai/codex`
    );
  }

  // Check 5: CODEX_API_KEY or saved credentials
  if (!process.env.CODEX_API_KEY) {
    // Check for saved codex login credentials
    const authResult = await exec(config.codex_command, ["auth", "status"]);
    if (authResult.exitCode !== 0) {
      throw new StartupError(
        "No Codex authentication found. Set CODEX_API_KEY environment variable or run 'codex login'."
      );
    }
  }
}
