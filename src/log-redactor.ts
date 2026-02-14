const PATTERNS: RegExp[] = [
  // API keys (OpenAI/Codex style)
  /sk-[a-zA-Z0-9]{20,}/g,
  // CODEX_API_KEY=... or OPENAI_API_KEY=...
  /(?:CODEX_API_KEY|OPENAI_API_KEY)=[^\s]+/g,
  // Bearer tokens
  /Bearer\s+[a-zA-Z0-9._-]+/g,
  // Private key blocks
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
  // Generic secret env vars
  /[a-zA-Z_]*(?:SECRET|TOKEN|PASSWORD|KEY)=[^\s]+/g,
];

export function redact(text: string): string {
  let result = text;
  for (const pattern of PATTERNS) {
    // Reset lastIndex for global regexps
    pattern.lastIndex = 0;
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}
