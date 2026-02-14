import type { ParsedCodexOutput, CodexEvent, CommandRecord, CommandExecutionItem, AgentMessageItem, FileChangeItem, UsageInfo } from "./types.js";

export function parseCodexOutput(jsonlStdout: string): ParsedCodexOutput {
  const commands_run: CommandRecord[] = [];
  const errors: string[] = [];
  const files_changed: string[] = [];
  const raw_events: CodexEvent[] = [];
  let summary = "";
  let usage: UsageInfo | null = null;

  // Map of item.id -> partial command record for correlation
  const commandMap = new Map<string, { cmd: string; exit_code: number | null }>();

  if (!jsonlStdout.trim()) {
    return { commands_run, summary, evidence: "", errors, files_changed, raw_events, usage };
  }

  const lines = jsonlStdout.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: CodexEvent;
    try {
      event = JSON.parse(trimmed) as CodexEvent;
    } catch {
      // Malformed JSON line - skip with no crash
      continue;
    }

    raw_events.push(event);

    switch (event.type) {
      case "item.started": {
        const item = (event as { type: "item.started"; item: any }).item;
        if (item?.type === "command_execution") {
          const cmdItem = item as CommandExecutionItem;
          commandMap.set(cmdItem.id, { cmd: cmdItem.command, exit_code: null });
        }
        break;
      }

      case "item.completed": {
        const item = (event as { type: "item.completed"; item: any }).item;
        if (!item) break;

        if (item.type === "command_execution") {
          const cmdItem = item as CommandExecutionItem;
          const existing = commandMap.get(cmdItem.id);
          if (existing) {
            existing.exit_code = cmdItem.exit_code ?? null;
            commands_run.push({ cmd: existing.cmd, exit_code: existing.exit_code });
          } else {
            // No matching started event - still record it
            commands_run.push({ cmd: cmdItem.command, exit_code: cmdItem.exit_code ?? null });
          }
        } else if (item.type === "agent_message") {
          const msgItem = item as AgentMessageItem;
          summary = msgItem.text || "";
        } else if (item.type === "file_change") {
          const fileItem = item as FileChangeItem;
          if (fileItem.path) {
            files_changed.push(fileItem.path);
          }
        }
        break;
      }

      case "error": {
        const errEvent = event as { type: "error"; message: string };
        if (errEvent.message) {
          errors.push(errEvent.message);
        }
        break;
      }

      case "turn.failed": {
        const failEvent = event as { type: "turn.failed"; error?: { message: string } };
        if (failEvent.error?.message) {
          errors.push(failEvent.error.message);
        }
        break;
      }

      case "turn.completed": {
        const turnEvent = event as { type: "turn.completed"; usage: UsageInfo };
        if (turnEvent.usage) {
          usage = {
            input_tokens: turnEvent.usage.input_tokens ?? 0,
            cached_input_tokens: turnEvent.usage.cached_input_tokens ?? 0,
            output_tokens: turnEvent.usage.output_tokens ?? 0,
          };
        }
        break;
      }

      default:
        // Unknown event type - already in raw_events
        break;
    }
  }

  // Build evidence string from command results
  const evidence = commands_run
    .map(c => `$ ${c.cmd} → exit ${c.exit_code ?? "unknown"}`)
    .join("\n");

  return { commands_run, summary, evidence, errors, files_changed, raw_events, usage };
}
