import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { nanoid } from "nanoid";
import { exec } from "./utils/exec.js";
import type { PatchValidationResult } from "./types.js";

export async function validatePatch(
  patch: string,
  repoRoot: string,
  baseRef: string
): Promise<PatchValidationResult> {
  if (!patch.trim()) {
    return { applicable: true, log: "no changes" };
  }

  const tmpPatchFile = join(tmpdir(), `patch-${nanoid()}.diff`);
  await writeFile(tmpPatchFile, patch);

  try {
    // Create a temp index from base_ref to validate against clean state
    const tmpIndex = join(tmpdir(), `index-${nanoid()}`);
    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
      ),
      GIT_INDEX_FILE: tmpIndex,
    };

    // Read tree from base_ref into temp index
    const readTreeResult = await exec("git", ["read-tree", baseRef], { cwd: repoRoot, env });
    if (readTreeResult.exitCode !== 0) {
      return { applicable: false, log: `Failed to read tree at ${baseRef}: ${readTreeResult.stderr}` };
    }

    // Apply check against the clean index
    const result = await exec(
      "git",
      ["apply", "--check", "--cached", tmpPatchFile],
      { cwd: repoRoot, env }
    );

    // Clean up temp index
    await unlink(tmpIndex).catch(() => {});

    return {
      applicable: result.exitCode === 0,
      log: result.stderr || "ok",
    };
  } finally {
    await unlink(tmpPatchFile).catch(() => {});
  }
}
