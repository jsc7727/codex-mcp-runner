import { describe, it, expect } from "vitest";
import { redact } from "../../src/log-redactor.js";

describe("redact", () => {
  it("redacts sk- API keys", () => {
    const result = redact("Key is sk-abcdefghij1234567890extra");
    expect(result).not.toContain("sk-abcdefghij1234567890extra");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts CODEX_API_KEY=value", () => {
    const result = redact("Config: CODEX_API_KEY=sk-12345678901234567890");
    expect(result).not.toContain("sk-12345678901234567890");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts Bearer tokens", () => {
    const result = redact("Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig");
    expect(result).not.toContain("eyJhbGciOiJSUzI1NiJ9");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts private keys", () => {
    const result = redact("-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ\n-----END RSA PRIVATE KEY-----");
    expect(result).not.toContain("MIIEowIBAAKCAQ");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts generic secret env vars", () => {
    const result = redact("DB_PASSWORD=hunter2 and AWS_SECRET=abc123");
    expect(result).not.toContain("hunter2");
    expect(result).not.toContain("abc123");
  });

  it("does not redact normal text", () => {
    const normal = "This is normal output from the build process.";
    expect(redact(normal)).toBe(normal);
  });

  it("handles empty string", () => {
    expect(redact("")).toBe("");
  });
});
