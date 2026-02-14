import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { RunCodexTasksInputSchema } from "./types.js";
import { loadConfig } from "./config.js";
import { validateEnvironment } from "./startup.js";
import { pruneStaleWorktrees } from "./worktree.js";
import { handleRunCodexTasks } from "./tools/run-codex-tasks.js";
import { handleReviewPlan } from "./tools/review-plan.js";

export async function createServer(): Promise<void> {
  // Load config
  const config = await loadConfig();

  // Startup validation
  await validateEnvironment(config, false);

  // Prune stale worktrees from previous crashes
  await pruneStaleWorktrees();

  // Create MCP server
  const server = new McpServer({
    name: "claude-codex-runner",
    version: "0.1.0",
  });

  // Register run_codex_tasks tool
  server.tool(
    "run_codex_tasks",
    "Run parallel Codex CLI tasks in isolated git worktrees. task_id values must be unique within a run.",
    RunCodexTasksInputSchema.shape,
    async (params) => {
      try {
        // The MCP SDK validates params against the schema shape
        // We need to parse the full object through the schema for refinements
        const parsed = RunCodexTasksInputSchema.parse(params);
        const result = await handleRunCodexTasks(parsed);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    }
  );

  // Register review_plan_with_codex tool
  server.tool(
    "review_plan_with_codex",
    "Review a development plan using Codex CLI to identify missing tasks, dependency issues, parallelization opportunities, test gaps, and risks.",
    {
      plan_text: z.string().min(1).describe("The development plan text to review"),
      repo_context: z.string().optional().describe("Optional repository context for the review"),
    },
    async (params) => {
      try {
        const result = await handleReviewPlan(params as { plan_text: string; repo_context?: string });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    }
  );

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
