const PATTERN_SOURCES: Array<[string, string]> = [
  [String.raw`sk-[a-zA-Z0-9]{20,}`, "g"],
  [String.raw`(?:CODEX_API_KEY|OPENAI_API_KEY)=[^\s]+`, "g"],
  [String.raw`Bearer\s+[a-zA-Z0-9._-]+`, "g"],
  [String.raw`-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----`, "g"],
  [String.raw`[a-zA-Z_]*(?:SECRET|TOKEN|PASSWORD|KEY)=[^\s]+`, "g"],
];

export function redact(text: string): string {
  let result = text;
  for (const [source, flags] of PATTERN_SOURCES) {
    result = result.replace(new RegExp(source, flags), "[REDACTED]");
  }
  return result;
}
