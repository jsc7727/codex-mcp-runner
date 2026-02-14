import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exec } from "../utils/exec.js";
import { loadConfig } from "../config.js";
import { sanitizeEnvironment } from "../security.js";
import { parseCodexOutput } from "../codex-output-parser.js";
import type { ReviewPlanInput, ReviewPlanOutput } from "../types.js";

export async function handleReviewPlan(
  input: ReviewPlanInput
): Promise<ReviewPlanOutput> {
  const config = await loadConfig();
  const env = sanitizeEnvironment(process.env);

  // Create a temp directory for Codex (no worktree needed, read-only)
  const tmpDir = await mkdtemp(join(tmpdir(), "codex-review-"));

  const reviewPrompt = `You are reviewing a development plan. Analyze it for:
- Missing tasks
- Dependency issues
- Parallelization opportunities
- Test gaps
- Risk flags
- Tasks that should be split

Plan:
${input.plan_text}

${input.repo_context ? `Repository context:\n${input.repo_context}\n` : ""}

Respond ONLY with a JSON object matching this schema:
{
  "missing_tasks": ["..."],
  "dependency_issues": ["..."],
  "parallelization_suggestions": ["..."],
  "test_gaps": ["..."],
  "risk_flags": ["..."],
  "recommended_task_splits": ["..."]
}`;

  try {
    const args = [
      "exec",
      "--full-auto",
      "--ephemeral",
      "--json",
      "-m", config.codex_model,
      "-C", tmpDir,
      "--skip-git-repo-check",
      "--",
      reviewPrompt,
    ];

    const result = await exec(config.codex_command, args, {
      cwd: tmpDir,
      timeout_ms: 120_000, // 2 minute timeout for review
      env,
    });

    // Parse JSONL to get the agent's response
    const parsed = parseCodexOutput(result.stdout);
    const responseText = parsed.summary;

    // Try to extract JSON from the response
    try {
      // Look for JSON in the response (may be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const report = JSON.parse(jsonMatch[0]);
        return {
          report: {
            missing_tasks: Array.isArray(report.missing_tasks) ? report.missing_tasks : [],
            dependency_issues: Array.isArray(report.dependency_issues) ? report.dependency_issues : [],
            parallelization_suggestions: Array.isArray(report.parallelization_suggestions) ? report.parallelization_suggestions : [],
            test_gaps: Array.isArray(report.test_gaps) ? report.test_gaps : [],
            risk_flags: Array.isArray(report.risk_flags) ? report.risk_flags : [],
            recommended_task_splits: Array.isArray(report.recommended_task_splits) ? report.recommended_task_splits : [],
          },
        };
      }
    } catch {
      // JSON parsing failed, use fallback
    }

    // Fallback: return raw text as a single risk flag
    return {
      report: {
        missing_tasks: [],
        dependency_issues: [],
        parallelization_suggestions: [],
        test_gaps: [],
        risk_flags: [responseText || "Codex review returned no structured output"],
        recommended_task_splits: [],
      },
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
