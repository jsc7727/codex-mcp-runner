import { describe, it, expect } from "vitest";
import { generateRunId, sanitizeId } from "../../src/utils/id.js";
import { InputValidationError } from "../../src/errors.js";

describe("generateRunId", () => {
  it("generates a string", () => {
    const id = generateRunId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRunId()));
    expect(ids.size).toBe(100);
  });
});

describe("sanitizeId", () => {
  it("accepts valid IDs", () => {
    expect(sanitizeId("my-task-1")).toBe("my-task-1");
    expect(sanitizeId("task.name")).toBe("task.name");
    expect(sanitizeId("task_123")).toBe("task_123");
  });

  it("rejects path traversal attempts", () => {
    expect(() => sanitizeId("../../../etc")).toThrow(InputValidationError);
  });

  it("rejects empty strings", () => {
    expect(() => sanitizeId("")).toThrow(InputValidationError);
  });

  it("rejects strings with spaces", () => {
    expect(() => sanitizeId("my task")).toThrow(InputValidationError);
  });

  it("rejects strings with slashes", () => {
    expect(() => sanitizeId("path/to/file")).toThrow(InputValidationError);
  });

  it("rejects strings over 64 chars", () => {
    expect(() => sanitizeId("a".repeat(65))).toThrow(InputValidationError);
  });
});
