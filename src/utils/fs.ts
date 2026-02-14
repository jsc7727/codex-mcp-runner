import { mkdir, rm } from "node:fs/promises";

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function removeDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}
