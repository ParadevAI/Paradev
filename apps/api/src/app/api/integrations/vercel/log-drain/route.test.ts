import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { signDrainBody } from "./verifyDrainSignature";

const { POST } = await import("./route");

const SECRET = process.env.VERCEL_LOG_DRAIN_SECRET as string;

function drainRequest(logs: unknown[], signature?: string): Request {
	const body = JSON.stringify(logs);
	return new Request("https://api.test/api/integrations/vercel/log-drain", {
		method: "POST",
		body,
		headers: {
			"content-type": "application/json",
			"x-vercel-signature": signature ?? signDrainBody(body, SECRET),
		},
	});
}

const CLAUDEBOT_REQUEST = {
	id: "1",
	source: "static",
	requestId: "r1",
	proxy: {
		timestamp: 1760400000000,
		method: "GET",
		host: "superset.sh",
		path: "/",
		userAgent: [
			"Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
		],
		statusCode: 200,
	},
};

let fetchSpy: ReturnType<typeof spyOn> | undefined;
afterEach(() => fetchSpy?.mockRestore());

describe("Vercel log drain route", () => {
	test("rejects a delivery with a bad signature before any forwarding", async () => {
		fetchSpy = spyOn(globalThis, "fetch");
		const response = await POST(
			drainRequest([CLAUDEBOT_REQUEST], "0".repeat(40)),
		);
		expect(response.status).toBe(403);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test("forwards AI agent requests from a signed delivery", async () => {
		fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { status: 200 }),
		);
		const response = await POST(drainRequest([CLAUDEBOT_REQUEST]));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ forwarded: 1, failed: 0 });
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	test("acknowledges a signed delivery with no AI agent traffic without forwarding", async () => {
		fetchSpy = spyOn(globalThis, "fetch");
		const response = await POST(drainRequest([{ id: "b", source: "build" }]));
		expect(response.status).toBe(200);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
