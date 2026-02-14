import { describe, it, expect } from "vitest";
import { RunCodexTasksInputSchema } from "../../src/types.js";

describe("RunCodexTasksInputSchema", () => {
  it("accepts valid input with unique task_ids", () => {
    const result = RunCodexTasksInputSchema.safeParse({
      base_ref: "HEAD",
      tasks: [
        { task_id: "task-1", prompt: "Do A" },
        { task_id: "task-2", prompt: "Do B" },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate task_ids", () => {
    const result = RunCodexTasksInputSchema.safeParse({
      base_ref: "HEAD",
      tasks: [
        { task_id: "same-id", prompt: "Do A" },
        { task_id: "same-id", prompt: "Do B" },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorMessages = result.error.issues.map(i => i.message);
      expect(errorMessages.some(m => m.includes("unique"))).toBe(true);
    }
  });

  it("rejects empty tasks array", () => {
    const result = RunCodexTasksInputSchema.safeParse({
      base_ref: "HEAD",
      tasks: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid task_id with path traversal", () => {
    const result = RunCodexTasksInputSchema.safeParse({
      base_ref: "HEAD",
      tasks: [
        { task_id: "../../../etc", prompt: "evil" },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects task_id with spaces", () => {
    const result = RunCodexTasksInputSchema.safeParse({
      base_ref: "HEAD",
      tasks: [
        { task_id: "my task", prompt: "test" },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts optional fields with defaults", () => {
    const result = RunCodexTasksInputSchema.safeParse({
      tasks: [{ task_id: "t1", prompt: "test" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.base_ref).toBe("HEAD");
      expect(result.data.dry_run).toBe(false);
    }
  });
});
