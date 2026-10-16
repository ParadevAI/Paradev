import { describe, expect, test } from "bun:test";
import { assertReaderSession, isReaderSession } from "./reader-session";

const caller = (
	headers: Record<string, string>,
	extra: { agent?: boolean; sandbox?: boolean } = {},
) => ({
	headers: new Headers(headers),
	agentCaller: extra.agent
		? { transport: "mcp" as const, label: "claude" }
		: null,
	sandboxCaller: extra.sandbox
		? ({ workspaceId: "w", userId: "u", organizationId: "o" } as never)
		: null,
});

const JWT = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1In0.c2lnbmF0dXJl";

describe("who may answer a card", () => {
	test("the app's own session answers: a cookie, or the app's session token", () => {
		expect(isReaderSession(caller({ cookie: "session=abc" }))).toBe(true);
		expect(
			isReaderSession(
				caller({ authorization: "Bearer k3yT0ken.c2lnbmF0dXJl" }),
			),
		).toBe(true);
	});

	test("what an agent in a terminal holds does not: the CLI's OAuth token or an API key", () => {
		expect(isReaderSession(caller({ authorization: `Bearer ${JWT}` }))).toBe(
			false,
		);
		expect(isReaderSession(caller({ "x-api-key": "sk_live_abc" }))).toBe(false);
		expect(
			isReaderSession(caller({ authorization: "Bearer sk_live_abc" })),
		).toBe(false);
	});

	test("a claimed client name changes nothing", () => {
		expect(
			isReaderSession(
				caller({
					authorization: `Bearer ${JWT}`,
					"x-superset-client": "desktop/1.35.0",
				}),
			),
		).toBe(false);
	});

	test("MCP and a cloud workspace's own credential do not", () => {
		expect(isReaderSession(caller({ cookie: "s=1" }, { agent: true }))).toBe(
			false,
		);
		expect(isReaderSession(caller({}, { sandbox: true }))).toBe(false);
	});

	test("the refusal says who answers a card", () => {
		expect(() =>
			assertReaderSession(caller({ authorization: `Bearer ${JWT}` })),
		).toThrow(/answered by the person it was sent to/);
		expect(() =>
			assertReaderSession(caller({ cookie: "session=abc" })),
		).not.toThrow();
	});
});
