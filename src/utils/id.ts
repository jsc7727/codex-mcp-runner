import { nanoid } from "nanoid";
import { InputValidationError } from "../errors.js";

const SAFE_ID_REGEX = /^[A-Za-z0-9._-]{1,64}$/;

export function generateRunId(): string {
  return nanoid(12);
}

export function sanitizeId(id: string): string {
  if (!SAFE_ID_REGEX.test(id)) {
    throw new InputValidationError(
      `Invalid ID: "${id}". Must match ${SAFE_ID_REGEX} (alphanumeric, dot, hyphen, underscore; 1-64 chars)`
    );
  }
  return id;
}
