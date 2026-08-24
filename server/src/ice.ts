import type { IceServer } from "@visio/shared";

/**
 * Build the ICE server list handed to browsers.
 *
 * Two configuration styles:
 *  - ICE_SERVERS: raw JSON array of {urls, username?, credential?}
 *  - TURN_URLS (comma separated) + TURN_USERNAME + TURN_CREDENTIAL
 */
export function buildIceServers(
  env: NodeJS.ProcessEnv = process.env
): IceServer[] {
  const raw = env.ICE_SERVERS?.trim();
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is IceServer => {
          if (!s || typeof s !== "object") return false;
          const urls = (s as IceServer).urls;
          if (typeof urls === "string") return urls.length > 0;
          return Array.isArray(urls) && urls.length > 0 && urls.every((u) => typeof u === "string");
        });
      }
    } catch {
      /* fall through to simple form */
    }
  }

  const urls = env.TURN_URLS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (urls && urls.length > 0 && env.TURN_USERNAME) {
    return [
      {
        urls,
        username: env.TURN_USERNAME,
        credential: env.TURN_CREDENTIAL ?? "",
      },
    ];
  }
  return [];
}
