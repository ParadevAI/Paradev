import { parseClaudeResetCredits } from "./reset-credits";
import type { createClaudeRequestClient } from "./claude-request";
import { hashQuotaScope } from "./quota-cooldown-store";
import type { UsageResetCredits } from "./types";

type Request = ReturnType<typeof createClaudeRequestClient>["request"];
const TTL = 15 * 60_000;
const MAX = 1024;
/** One primary request carries optional reset inventory. Never run a second polling engine. */
export function createClaudeResetEnvelope(request: Request, now = Date.now) {
 const entries = new Map<string, {at: number; unsupportedUntil?: number; credits?: UsageResetCredits}>();
 return async (token: string, url: string, init: RequestInit, canonical?: string | null) => {
  const key = hashQuotaScope(["claude-reset-envelope-v1", token, canonical ?? null]);
  const saved = entries.get(key);
  const inventory = (!saved || now() - saved.at >= TTL) && !(saved?.unsupportedUntil && saved.unsupportedUntil > now());
  let response = await request("usage", token, `${url}${inventory ? "?cedar_ember=1" : ""}`, init, canonical);
  let unsupportedUntil = saved?.unsupportedUntil;
  if(inventory && [400,403].includes(response.status) && !init.signal?.aborted) {
   unsupportedUntil = now() + 60 * 60_000;
   response = await request("usage", token, url, init, canonical);
  }
  let credits = saved?.credits;
  if(inventory && response.ok) {
   try {
    const body: unknown = await response.clone().json();
    credits = parseClaudeResetCredits(body && typeof body === "object" && !Array.isArray(body) ? (body as {cedar_ember?:unknown}).cedar_ember : undefined, new Date(now()));
   } catch { credits = undefined; }
  }
  if ([401,403].includes(response.status)) { entries.delete(key); credits = undefined; }
  else if(inventory && response.ok || unsupportedUntil) {
   if(entries.size >= MAX) for(const [id,entry] of entries) if(now() - entry.at > 60*60_000) entries.delete(id);
   if(entries.has(key) || entries.size < MAX) entries.set(key,{at:now(),unsupportedUntil,credits});
  }
  return {response, resetCredits: credits && now()-credits.checkedAt.getTime() <= TTL ? credits : undefined};
 };
}
