import { randomBytes } from "node:crypto";

/** ~128 bits of entropy, URL-safe. Room links are the "password". */
export function randomRoomToken(): string {
  return randomBytes(16).toString("base64url");
}

export function newId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("base64url")}`;
}
