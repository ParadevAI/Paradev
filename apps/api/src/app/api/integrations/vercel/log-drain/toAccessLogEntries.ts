import { z } from "zod";
import { AI_AGENT_USER_AGENTS } from "./constants";

export interface AccessLogEntry {
	timestamp: string;
	request_method: string;
	request_url: string;
	response_status: number;
	user_agent: string;
	client_ip?: string;
	referer?: string;
	country_code?: string;
}

const proxySchema = z.looseObject({
	timestamp: z.number(),
	method: z.string().min(1),
	host: z.string().min(1),
	path: z.string(),
	userAgent: z.union([z.array(z.string()), z.string()]),
	statusCode: z.number().optional(),
	clientIp: z.string().optional(),
	referer: z.string().optional(),
});

const drainLogSchema = z.looseObject({
	id: z.string().optional(),
	source: z.string().optional(),
	requestId: z.string().optional(),
	statusCode: z.number().optional(),
	proxy: proxySchema,
});

const AI_AGENT_PATTERNS = AI_AGENT_USER_AGENTS.map((name) =>
	name.toLowerCase(),
);

export function isAiAgentUserAgent(userAgent: string): boolean {
	const lowered = userAgent.toLowerCase();
	return AI_AGENT_PATTERNS.some((pattern) => lowered.includes(pattern));
}

/** Accepts both drain encodings: a JSON array, or NDJSON. */
export function parseDrainBody(body: string): unknown[] {
	try {
		const parsed: unknown = JSON.parse(body);
		return Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		const entries: unknown[] = [];
		for (const line of body.split("\n")) {
			if (!line.trim()) continue;
			try {
				entries.push(JSON.parse(line));
			} catch {}
		}
		return entries;
	}
}

export function buildRequestUrl(host: string, path: string): string | null {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	try {
		return new URL(`https://${host}${normalizedPath}`).toString();
	} catch {
		return null;
	}
}

function isHttpStatus(value: number | undefined): value is number {
	return (
		value !== undefined &&
		Number.isInteger(value) &&
		value >= 100 &&
		value <= 599
	);
}

export function toAccessLogEntries(rawEntries: unknown[]): AccessLogEntry[] {
	const seenRequests = new Set<string>();
	const entries: AccessLogEntry[] = [];

	for (const raw of rawEntries) {
		const parsed = drainLogSchema.safeParse(raw);
		if (!parsed.success || parsed.data.source === "build") continue;
		const log = parsed.data;
		const { proxy } = log;

		const userAgent = (
			Array.isArray(proxy.userAgent)
				? proxy.userAgent.join(", ")
				: proxy.userAgent
		).trim();
		if (!userAgent || !isAiAgentUserAgent(userAgent)) continue;

		// A function request logs once per stdout line, each carrying the same proxy data.
		const requestKey = log.requestId ?? log.id;
		if (requestKey) {
			if (seenRequests.has(requestKey)) continue;
			seenRequests.add(requestKey);
		}

		const status = isHttpStatus(proxy.statusCode)
			? proxy.statusCode
			: log.statusCode;
		const requestUrl = buildRequestUrl(proxy.host, proxy.path);
		const time = new Date(proxy.timestamp);
		if (!isHttpStatus(status) || !requestUrl || Number.isNaN(time.getTime())) {
			continue;
		}

		entries.push({
			timestamp: time.toISOString(),
			request_method: proxy.method.toUpperCase(),
			request_url: requestUrl,
			response_status: status,
			user_agent: userAgent,
			...(proxy.clientIp ? { client_ip: proxy.clientIp } : {}),
			...(proxy.referer ? { referer: proxy.referer } : {}),
		});
	}

	return entries;
}
