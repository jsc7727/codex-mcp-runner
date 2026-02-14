#!/usr/bin/env node
import { createServer } from "./server.js";
import { activeRuns } from "./active-runs.js";
import { cleanupRun } from "./worktree.js";

// Signal handlers for graceful cleanup
process.on("SIGINT", () => {
  const cleanups = [...activeRuns].map(runId => cleanupRun(runId).catch(() => {}));
  Promise.allSettled(cleanups).finally(() => process.exit(130));
});

process.on("SIGTERM", () => {
  const cleanups = [...activeRuns].map(runId => cleanupRun(runId).catch(() => {}));
  Promise.allSettled(cleanups).finally(() => process.exit(143));
});

await createServer();
