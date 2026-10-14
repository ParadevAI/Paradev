import { describe, expect, test } from "bun:test";
import {
	buildRequestUrl,
	isAiAgentUserAgent,
	parseDrainBody,
	toAccessLogEntries,
} from "./toAccessLogEntries";

const GPTBOT_UA =
	"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot";
const BROWSER_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

function requestLog(overrides: Record<string, unknown> = {}, proxy = {}) {
	return {
		id: "1573817250283254651097202070",
		deploymentId: "dpl_233NRGRjVZX1caZrXWtz5g1TAksD",
		source: "static",
		host: "superset-marketing.vercel.app",
		timestamp: 1573817250283,
		projectId: "gdufoJxB6b9b1fEqr1jUtFkyavUU",
		level: "info",
		requestId: "643af4e3-975a-4cc7-9e7a-1eda11539d90",
		proxy: {
			timestamp: 1573817250172,
			method: "GET",
			host: "superset.sh",
			path: "/docs/agents?ref=x",
			userAgent: [GPTBOT_UA],
			referer: "https://chatgpt.com/",
			region: "sfo1",
			statusCode: 200,
			clientIp: "120.75.16.101",
			scheme: "https",
			...proxy,
		},
		...overrides,
	};
}

describe("isAiAgentUserAgent", () => {
	test("matches listed agents case-insensitively as a substring", () => {
		expect(isAiAgentUserAgent(GPTBOT_UA)).toBe(true);
		expect(isAiAgentUserAgent("claude-user/1.0")).toBe(true);
		expect(
			isAiAgentUserAgent("Mozilla/5.0 (compatible; META-EXTERNALFETCHER/1.1)"),
		).toBe(true);
	});

	test("ignores ordinary browsers and other bots", () => {
		expect(isAiAgentUserAgent(BROWSER_UA)).toBe(false);
		expect(isAiAgentUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(
			false,
		);
	});
});

describe("buildRequestUrl", () => {
	test("joins an https scheme, host, path and query", () => {
		expect(buildRequestUrl("superset.sh", "/docs/agents?ref=x")).toBe(
			"https://superset.sh/docs/agents?ref=x",
		);
		expect(buildRequestUrl("superset.sh", "")).toBe("https://superset.sh/");
	});

	test("returns null for a host that is not a valid URL host", () => {
		expect(buildRequestUrl("bad host", "/")).toBeNull();
	});
});

describe("parseDrainBody", () => {
	test("reads a JSON array and NDJSON the same way", () => {
		const logs = [requestLog(), requestLog({ id: "2", requestId: "r2" })];
		const ndjson = logs.map((log) => JSON.stringify(log)).join("\n");
		expect(parseDrainBody(JSON.stringify(logs))).toEqual(logs);
		expect(parseDrainBody(`${ndjson}\n`)).toEqual(logs);
	});
});

describe("toAccessLogEntries", () => {
	test("maps an AI agent request to the access log shape", () => {
		expect(toAccessLogEntries([requestLog()])).toEqual([
			{
				timestamp: "2019-11-15T11:27:30.172Z",
				request_method: "GET",
				request_url: "https://superset.sh/docs/agents?ref=x",
				response_status: 200,
				user_agent: GPTBOT_UA,
				client_ip: "120.75.16.101",
				referer: "https://chatgpt.com/",
			},
		]);
	});

	test("drops browser traffic and logs without request data", () => {
		const buildLog = {
			id: "1",
			source: "build",
			type: "stdout",
			message: "Build completed",
			host: "x.vercel.app",
			timestamp: 1,
		};
		const stdoutWithoutProxy = { ...buildLog, source: "lambda", message: "hi" };
		expect(
			toAccessLogEntries([
				buildLog,
				stdoutWithoutProxy,
				requestLog({}, { userAgent: [BROWSER_UA] }),
			]),
		).toEqual([]);
	});

	test("keeps one entry per request when a function logs several lines", () => {
		const first = requestLog({
			source: "lambda",
			type: "stdout",
			message: "a",
		});
		const second = requestLog({
			source: "lambda",
			type: "stdout",
			id: "other",
			message: "b",
		});
		expect(toAccessLogEntries([first, second])).toHaveLength(1);
	});

	test("drops entries missing a required field or with no real status", () => {
		const noMethod = requestLog({ requestId: "a" }, { method: undefined });
		const backgroundRevalidation = requestLog(
			{ requestId: "b", statusCode: undefined },
			{ statusCode: -1 },
		);
		expect(toAccessLogEntries([noMethod, backgroundRevalidation])).toEqual([]);
	});

	test("falls back to the function status when the proxy has none", () => {
		const [entry] = toAccessLogEntries([
			requestLog({ statusCode: 404 }, { statusCode: undefined }),
		]);
		expect(entry?.response_status).toBe(404);
	});
});
