import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCodexOutput } from "../../src/codex-output-parser.js";

const fixturesDir = join(import.meta.dirname, "../fixtures");

describe("parseCodexOutput", () => {
  it("parses success fixture correctly", () => {
    const jsonl = readFileSync(join(fixturesDir, "real-jsonl-success.jsonl"), "utf-8");
    const result = parseCodexOutput(jsonl);

    expect(result.commands_run).toHaveLength(1);
    expect(result.commands_run[0].cmd).toBe("bash -lc ls");
    expect(result.commands_run[0].exit_code).toBe(0);
    expect(result.files_changed).toContain("src/index.ts");
    expect(result.summary).toContain("updated the src/index.ts");
    expect(result.usage).not.toBeNull();
    expect(result.usage!.input_tokens).toBe(24763);
    expect(result.usage!.cached_input_tokens).toBe(24448);
    expect(result.usage!.output_tokens).toBe(122);
    expect(result.errors).toHaveLength(0);
  });

  it("parses error fixture correctly", () => {
    const jsonl = readFileSync(join(fixturesDir, "real-jsonl-error.jsonl"), "utf-8");
    const result = parseCodexOutput(jsonl);

    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("o1-pro");
    expect(result.errors[1]).toContain("Model not available");
    expect(result.commands_run).toHaveLength(0);
    expect(result.summary).toBe("");
  });

  it("parses mixed fixture with retries correctly", () => {
    const jsonl = readFileSync(join(fixturesDir, "real-jsonl-mixed.jsonl"), "utf-8");
    const result = parseCodexOutput(jsonl);

    expect(result.commands_run).toHaveLength(2);
    expect(result.commands_run[0].exit_code).toBe(1); // first npm test failed
    expect(result.commands_run[1].exit_code).toBe(0); // second npm test passed
    expect(result.files_changed).toContain("src/utils.ts");
    // Summary should be the LAST agent_message
    expect(result.summary).toContain("Fixed the failing test");
    expect(result.usage).not.toBeNull();
    expect(result.usage!.input_tokens).toBe(35000);
  });

  it("handles empty input", () => {
    const result = parseCodexOutput("");
    expect(result.commands_run).toHaveLength(0);
    expect(result.summary).toBe("");
    expect(result.evidence).toBe("");
    expect(result.errors).toHaveLength(0);
    expect(result.files_changed).toHaveLength(0);
    expect(result.usage).toBeNull();
  });

  it("handles whitespace-only input", () => {
    const result = parseCodexOutput("   \n  \n  ");
    expect(result.commands_run).toHaveLength(0);
  });

  it("skips malformed JSON lines without crashing", () => {
    const jsonl = `{"type":"turn.started"}
not valid json
{"type":"item.completed","item":{"id":"x","type":"agent_message","text":"hello","status":"completed"}}`;
    const result = parseCodexOutput(jsonl);
    expect(result.summary).toBe("hello");
    expect(result.raw_events).toHaveLength(2); // malformed line skipped
  });

  it("builds evidence string from commands", () => {
    const jsonl = `{"type":"item.started","item":{"id":"c1","type":"command_execution","command":"npm test","status":"in_progress"}}
{"type":"item.completed","item":{"id":"c1","type":"command_execution","command":"npm test","status":"completed","exit_code":0}}`;
    const result = parseCodexOutput(jsonl);
    expect(result.evidence).toContain("$ npm test");
    expect(result.evidence).toContain("exit 0");
  });

  it("handles item.completed without matching item.started", () => {
    const jsonl = `{"type":"item.completed","item":{"id":"orphan","type":"command_execution","command":"orphan-cmd","status":"completed","exit_code":1}}`;
    const result = parseCodexOutput(jsonl);
    expect(result.commands_run).toHaveLength(1);
    expect(result.commands_run[0].cmd).toBe("orphan-cmd");
    expect(result.commands_run[0].exit_code).toBe(1);
  });
});
