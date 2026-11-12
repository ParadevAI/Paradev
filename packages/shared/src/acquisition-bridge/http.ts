import { createHash, randomBytes } from "node:crypto";
import { hasAnalyticsOptOut } from "./browser";
import {
	AcquisitionBridge,
	type AcquisitionKV,
	bridgeCookie,
	hasExactOrigin,
	type IdentifyEvent,
	readBridgeCookie,
	validateReturnTo,
} from "./server";
import { collectTouchSnapshot } from "./touch";

const TOKEN = /^[a-f0-9]{64}$/;
const HEADERS = {
	"Cache-Control": "no-store",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
};
type JourneyCookie = "attempt" | "return" | "staged";
const journeyName = (kind: JourneyCookie, attempt: string) =>
	`__Host-acq_${kind}_${attempt}`;
const journeyCookie = (kind: JourneyCookie, attempt: string, value: string) =>
	`${journeyName(kind, attempt)}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${value ? 120 : 0}`;
function readJourneyCookie(
	request: Request,
	kind: JourneyCookie,
	attempt: string,
) {
	const prefix = `${journeyName(kind, attempt)}=`;
	const values = (request.headers.get("cookie") ?? "")
		.split(";")
		.map((p) => p.trim())
		.filter((p) => p.startsWith(prefix));
	return values.length === 1 ? values[0]?.slice(prefix.length) : undefined;
}
const json = (body: unknown, status = 200, cookie?: string) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			...HEADERS,
			"Content-Type": "application/json",
			...(cookie ? { "Set-Cookie": cookie } : {}),
		},
	});
function redirect(url: URL, cookies: string[] = []) {
	const headers = new Headers({ ...HEADERS, Location: url.href });
	for (const cookie of cookies) headers.append("Set-Cookie", cookie);
	return new Response(null, { status: 303, headers });
}
async function body(request: Request): Promise<string> {
	const reader = request.body?.getReader();
	if (!reader) return "";
	let text = "";
	let size = 0;
	const decoder = new TextDecoder();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 8192) throw new Error("Body too large");
			text += decoder.decode(value, { stream: true });
		}
		return text + decoder.decode();
	} finally {
		reader.releaseLock();
	}
}
function scriptPage(script: string, formAction: string) {
	const nonce = randomBytes(18).toString("base64url");
	return new Response(
		`<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="origin"></head><body><form method="post" action="${formAction}"><input name="ticket" type="hidden" value=""></form><script nonce="${nonce}">${script}</script></body></html>`,
		{
			headers: {
				...HEADERS,
				"Referrer-Policy": "origin",
				"Content-Type": "text/html; charset=utf-8",
				"Content-Security-Policy": `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'self'; form-action ${new URL(formAction).origin}; script-src 'nonce-${nonce}'`,
			},
		},
	);
}
const literal = (value: string) =>
	JSON.stringify(value).replaceAll("<", "\\u003c");
export type BridgeHttpOptions = {
	kv: AcquisitionKV;
	marketingOrigin: string;
	webOrigin: string;
	consentKey: string;
	posthogKey: string;
	marketingAvailable?: () => Promise<boolean>;
};
export function createBridgeHttp(options: BridgeHttpOptions) {
	const marketing = new URL(options.marketingOrigin).origin;
	const web = new URL(options.webOrigin).origin;
	const bridge = new AcquisitionBridge(options.kv, {
		internalOrigins: [marketing, web],
	});
	async function limit(request: Request) {
		const ip =
			request.headers.get("cf-connecting-ip") ??
			request.headers.get("x-real-ip") ??
			request.headers.get("x-forwarded-for")?.split(",")[0] ??
			"unknown";
		const hash = createHash("sha256").update(ip).digest("hex");
		const count = await options.kv.eval(
			"local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return n",
			[`acquisition-bridge:rate:${hash}`],
			[],
		);
		return typeof count === "number" && count <= 60;
	}
	return {
		async marketing(request: Request, action: string): Promise<Response> {
			if (action === "health" && request.method === "GET")
				return json({ ok: true });
			if (action === "visit" && request.method === "GET") {
				const attempt = new URL(request.url).searchParams.get("attempt") ?? "";
				const target = `${web}/api/acquisition/receive?attempt=${attempt}`;
				if (!TOKEN.test(attempt))
					return json({ error: "Invalid attempt" }, 400);
				const script = `let sent=false;const form=document.forms[0];function send(ticket){if(sent)return;sent=true;form.elements.ticket.value=ticket;form.submit()}setTimeout(()=>send(''),5000);const optedOut=(${hasAnalyticsOptOut.toString()})(${literal(options.consentKey)},${literal(options.posthogKey)});fetch('/api/acquisition/issue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attempt:${literal(attempt)},optedOut}),signal:AbortSignal.timeout(4000)}).then(r=>r.ok?r.json():null).then(r=>send(r?.ticket??'')).catch(()=>send(''));`;
				return scriptPage(script, target);
			}
			if (request.method !== "POST" || !hasExactOrigin(request, marketing))
				return json({ error: "Forbidden" }, 403);
			try {
				if (!(await limit(request)))
					return json({ error: "Rate limited" }, 429);
				const input = JSON.parse(await body(request)) as Record<
					string,
					unknown
				>;
				const credential = readBridgeCookie(request, "lineage");
				const optedOut = input.optedOut !== false;
				if (action === "lineage") {
					const intentAt =
						typeof input.intentAt === "number" ? input.intentAt : undefined;
					const result = optedOut
						? await bridge.revokeLineage(credential, intentAt)
						: await bridge.updateLineage(
								credential,
								"enabled",
								input.touch,
								intentAt,
							);
					return json(
						{ anonymousId: optedOut ? null : (result?.anonymousId ?? null) },
						200,
						result?.setCookie,
					);
				}
				if (action === "issue") {
					if (optedOut) await bridge.revokeLineage(credential);
					const result = await bridge.issue(
						input.attempt,
						optedOut ? null : credential,
						!optedOut,
					);
					return result
						? json({ ticket: result.ticket }, 200, result.setCookie)
						: json({ error: "Expired attempt" }, 400);
				}
				return json({ error: "Not found" }, 404);
			} catch {
				return json({ error: "Attribution unavailable" }, 503);
			}
		},
		async web(request: Request, action: string): Promise<Response> {
			const url = new URL(request.url);
			if (action === "begin" && request.method === "GET") {
				const returnTo =
					validateReturnTo(url.searchParams.get("returnTo")) ?? "/sign-in";
				const fallback = new URL(returnTo, web);
				fallback.searchParams.set("_acq", "1");
				try {
					if (!(await limit(request)))
						return redirect(fallback, [bridgeCookie("pending", "", 0)]);
					const encodedReturn = Buffer.from(returnTo).toString("base64url");
					if (encodedReturn.length > 3500)
						return redirect(fallback, [bridgeCookie("pending", "", 0)]);
					if (
						options.marketingAvailable &&
						!(await options.marketingAvailable())
					)
						return redirect(fallback, [bridgeCookie("pending", "", 0)]);
					const entry = new URL(returnTo, web);
					const result = await bridge.begin(
						returnTo,
						entry.pathname === "/sign-in" || entry.pathname === "/sign-up"
							? collectTouchSnapshot(
									{
										href: entry.href,
										referrer: request.headers.get("referer") ?? undefined,
									},
									{ internalOrigins: [marketing, web] },
								)
							: undefined,
					);
					const target = new URL("/api/acquisition/visit", marketing);
					target.searchParams.set("attempt", result.attempt);
					return redirect(target, [
						journeyCookie("attempt", result.attempt, result.attempt),
						journeyCookie("return", result.attempt, encodedReturn),
						bridgeCookie("pending", "", 0),
					]);
				} catch {
					return redirect(fallback, [bridgeCookie("pending", "", 0)]);
				}
			}
			if (action === "receive" && request.method === "POST") {
				if (!hasExactOrigin(request, marketing))
					return json({ error: "Forbidden" }, 403);
				const attempt = url.searchParams.get("attempt") ?? "";
				if (!TOKEN.test(attempt))
					return json({ error: "Invalid attempt" }, 400);
				try {
					const fields = new URLSearchParams(await body(request));
					const ticket = fields.get("ticket") ?? "";
					const target = new URL("/api/acquisition/finalize", web);
					target.searchParams.set("attempt", attempt);
					return redirect(target, [
						journeyCookie("staged", attempt, TOKEN.test(ticket) ? ticket : ""),
					]);
				} catch {
					return json({ error: "Invalid request" }, 400);
				}
			}
			if (action === "finalize" && request.method === "GET") {
				const attempt = url.searchParams.get("attempt") ?? "";
				if (
					!TOKEN.test(attempt) ||
					readJourneyCookie(request, "attempt", attempt) !== attempt
				)
					return redirect(new URL("/sign-in?_acq=1", web));
				const ticket = readJourneyCookie(request, "staged", attempt);
				const savedReturn = readJourneyCookie(request, "return", attempt);
				let returnTo =
					savedReturn && savedReturn.length <= 3500
						? (validateReturnTo(
								Buffer.from(savedReturn, "base64url").toString(),
							) ?? "/sign-in")
						: "/sign-in";
				const cookies = [journeyCookie("staged", attempt, "")];
				try {
					const result = await bridge.receive(ticket, attempt);
					if (result.state !== "invalid") returnTo = result.returnTo;
					if (result.state === "invalid" && !ticket) {
						const record = await options.kv.getdel<{
							returnTo: string;
							expiresAt: number;
						}>(`acquisition-bridge:attempt:${attempt}`);
						if (record && record.expiresAt > Date.now())
							returnTo = validateReturnTo(record.returnTo) ?? returnTo;
					}
					if (!ticket || result.state !== "invalid")
						cookies.push(
							journeyCookie("attempt", attempt, ""),
							journeyCookie("return", attempt, ""),
						);
					if (result.state !== "invalid") cookies.push(...result.setCookies);
				} catch {}
				const target = new URL(returnTo, web);
				target.searchParams.set("_acq", "1");
				return redirect(target, cookies);
			}
			return json({ error: "Not found" }, 404);
		},
		async bind(
			request: Request,
			userId: string | null,
			capture: (event: IdentifyEvent) => Promise<void>,
		): Promise<Response> {
			if (request.method !== "POST" || !hasExactOrigin(request, web))
				return json({ error: "Forbidden" }, 403);
			if (!userId) return json({ error: "Unauthorized" }, 401);
			const status = await this.bindForUser(request, userId, capture);
			return json({ status }, 200, bridgeCookie("pending", "", 0));
		},
		async bindForUser(
			request: Request,
			userId: string,
			capture: (event: IdentifyEvent) => Promise<void>,
		): Promise<"submitted" | "skipped" | "unavailable"> {
			try {
				const event = await bridge.bind(
					readBridgeCookie(request, "pending"),
					userId,
				);
				if (!event) return "skipped";
				await capture(event);
				return "submitted";
			} catch {
				return "unavailable";
			}
		},
	};
}
