import { describe, expect, test } from "bun:test";
import { callerSessionId, withIssuedSessionId } from "./callerSession";

const URL = "https://api.test/mcp/plugins/superset/posthog";
const ID = "0b6a3f9e-2c4d-4e5f-8a7b-9c0d1e2f3a4b";

function request(method: string, sessionId?: string): Request {
	return new Request(URL, {
		method,
		headers: sessionId ? { "mcp-session-id": sessionId } : {},
	});
}

describe("callerSessionId", () => {
	test("reads a UUID session id", () => {
		expect(callerSessionId(request("POST", ID))).toBe(ID);
	});

	test("ignores an id that is not a UUID", () => {
		expect(callerSessionId(request("POST", "user-b:anything"))).toBeUndefined();
	});
});

describe("withIssuedSessionId", () => {
	const issued = (req: Request) =>
		withIssuedSessionId(req, new Response(null)).headers.get("mcp-session-id");

	test("issues a UUID on a POST without one", () => {
		expect(
			callerSessionId(request("POST", issued(request("POST")) ?? "")),
		).toBeDefined();
	});

	test("issues nothing on a POST that has one, even one it ignores", () => {
		expect(issued(request("POST", ID))).toBeNull();
		expect(issued(request("POST", "not-a-uuid"))).toBeNull();
	});

	test("issues nothing on GET or DELETE", () => {
		expect(issued(request("GET"))).toBeNull();
		expect(issued(request("DELETE"))).toBeNull();
	});
});
