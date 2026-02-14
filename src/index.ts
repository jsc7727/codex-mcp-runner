#!/usr/bin/env node
import { createServer } from "./server.js";
import { activeRuns } from "./active-runs.js";
import { cleanupRun } from "./worktree.js";

// Signal handlers for graceful cleanup
process.on("SIGINT", async () => {
  for (const runId of activeRuns) {
    await cleanupRun(runId).catch(() => {});
  }
  process.exit(130);
});

process.on("SIGTERM", async () => {
  for (const runId of activeRuns) {
    await cleanupRun(runId).catch(() => {});
  }
  process.exit(143);
});

await createServer();
