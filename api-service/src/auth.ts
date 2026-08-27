import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isAuthorized(
  authorizationHeader: string | undefined,
  expectedToken: string
) {
  const match = authorizationHeader?.match(/^Bearer (\S+)$/i);
  if (!match?.[1]) {
    return false;
  }

  return timingSafeEqual(digest(match[1]), digest(expectedToken));
}
