import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("./slackBots", () => ({
	slackBots: async () => new Map([["T0TEAM", "xoxb-test"]]),
}));

const { serveSlackFile, slackFileTickets } = await import("./slackFiles");

const tickets = slackFileTickets({
	secret: "test-secret-test-secret-test-secret-00",
	apiUrl: "https://api.example.test",
});
const later = slackFileTickets(
	{
		secret: "test-secret-test-secret-test-secret-00",
		apiUrl: "https://api.example.test",
	},
	() => Date.now() + 8 * 3600_000,
);
const slackFileUrl = tickets.urlFor;
const readSlackFileTicket = tickets.read;
const serve = (token: string) => serveSlackFile(token, tickets.read);

const ORG = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const tokenOf = (url: string | null) => url?.split("/").pop() ?? "";

const realFetch = globalThis.fetch;
const calls: { url: string; auth: string | null }[] = [];
let fileInfo: unknown;

beforeAll(() => {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({
			url,
			auth: new Headers(init?.headers).get("authorization"),
		});
		if (url.startsWith("https://slack.com/api/files.info")) {
			return Response.json(fileInfo);
		}
		if (url.startsWith("https://files.slack.com/")) {
			return new Response(new Uint8Array([137, 80, 78, 71]), {
				headers: { "content-type": "image/png" },
			});
		}
		return new Response("unexpected", { status: 500 });
	}) as typeof fetch;
});

afterAll(() => {
	globalThis.fetch = realFetch;
});

describe("slack file tickets", () => {
	test("sign and read back, reject tampering and expiry", () => {
		const url = slackFileUrl(ORG, "T0TEAM", "F0SHOT00001");
		expect(
			url?.startsWith("https://api.example.test/api/inbox/slack-files/"),
		).toBe(true);
		const token = tokenOf(url);
		expect(readSlackFileTicket(token)).toMatchObject({
			o: ORG,
			t: "T0TEAM",
			f: "F0SHOT00001",
		});
		const [payload, signature] = token.split(".");
		const forged = Buffer.from(
			JSON.stringify({ o: ORG, t: "T0TEAM", f: "F0OTHER123", e: 9999999999 }),
		).toString("base64url");
		expect(readSlackFileTicket(`${forged}.${signature}`)).toBeNull();
		expect(readSlackFileTicket(`${payload}.x${signature}`)).toBeNull();
		expect(later.read(token)).toBeNull();
		expect(slackFileUrl(ORG, "T0TEAM", "not-a-file")).toBeNull();
	});
});

describe("serveSlackFile", () => {
	test("streams the thumbnail with the bot token", async () => {
		fileInfo = {
			ok: true,
			file: {
				mimetype: "image/png",
				thumb_720: "https://files.slack.com/files-tmb/T0-F0-x/shot_720.png",
			},
		};
		calls.length = 0;
		const res = await serve(
			tokenOf(slackFileUrl(ORG, "T0TEAM", "F0SHOT00001")),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/png");
		expect(res.headers.get("cache-control")).toContain("private");
		expect(calls.map((c) => c.auth)).toEqual([
			"Bearer xoxb-test",
			"Bearer xoxb-test",
		]);
	});

	test("refuses a file that is not an image, or a source off Slack's file host", async () => {
		const token = tokenOf(slackFileUrl(ORG, "T0TEAM", "F0SHOT00001"));
		fileInfo = {
			ok: true,
			file: {
				mimetype: "application/pdf",
				url_private: "https://files.slack.com/x.pdf",
			},
		};
		expect((await serve(token)).status).toBe(404);
		fileInfo = {
			ok: true,
			file: { mimetype: "image/png", thumb_720: "https://evil.example/x.png" },
		};
		expect((await serve(token)).status).toBe(404);
	});

	test("refuses a workspace the organization has not connected", async () => {
		expect(
			(await serve(tokenOf(slackFileUrl(ORG, "T0OTHER", "F0SHOT00001"))))
				.status,
		).toBe(404);
	});
});
