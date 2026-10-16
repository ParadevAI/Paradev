import { describe, expect, test } from "bun:test";
import {
	DIRECT_MAX_BYTES,
	type FileStorage,
	gmailFileTickets,
	serveGmailFile,
} from "./gmailFiles";

const tickets = gmailFileTickets("test-secret-test-secret-test-secret-00");
const ORG = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function account(
	parts: Record<string, { mimeType: string; filename: string; size?: number }>,
) {
	return async () => ({
		canModify: true,
		client: {
			users: {
				messages: {
					get: async () => ({
						data: {
							payload: {
								partId: "",
								parts: Object.entries(parts).map(([partId, part]) => ({
									partId,
									mimeType: part.mimeType,
									filename: part.filename,
									body: {
										attachmentId: `att-${partId}`,
										size: part.size ?? 14,
									},
								})),
							},
						},
					}),
					attachments: {
						get: async ({ id }: { id: string }) => ({
							data: {
								data: Buffer.from(`bytes of ${id}`).toString("base64url"),
							},
						}),
					},
				},
			},
		},
	});
}

describe("serveGmailFile", () => {
	const parts = {
		"1": { mimeType: "image/png", filename: "lodge.png" },
		"2": { mimeType: "text/html", filename: "page.html" },
	};
	const serve = (partId: string) =>
		serveGmailFile(
			tickets.sign({ o: ORG, u: "user-1", m: "1a0fb9ddcfe52482", p: partId }),
			tickets.read,
			account(parts) as never,
		);

	test("an image shows inline under its own type", async () => {
		const res = await serve("1");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/png");
		expect(res.headers.get("content-disposition")).toStartWith("inline");
		expect(await res.text()).toBe("bytes of att-1");
	});

	test("anything else downloads as bytes, never rendered by the browser", async () => {
		const res = await serve("2");
		expect(res.headers.get("content-type")).toBe("application/octet-stream");
		expect(res.headers.get("content-disposition")).toBe(
			"attachment; filename*=UTF-8''page.html",
		);
	});

	test("the renderer can read a file to draw its preview", async () => {
		const res = await serve("2");
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
	});

	test("a file on Gmail's blocked list is refused, whatever its size", async () => {
		const blocked = {
			"4": { mimeType: "application/x-msdownload", filename: "setup.exe" },
		};
		const res = await serveGmailFile(
			tickets.sign({ o: ORG, u: "user-1", m: "1a0fb9ddcfe52482", p: "4" }),
			tickets.read,
			account(blocked) as never,
		);
		expect(res.status).toBe(403);
	});

	test("a forged ticket or a missing part is not found", async () => {
		expect(
			(await serveGmailFile("nope.nope", tickets.read, account(parts) as never))
				.status,
		).toBe(404);
		expect((await serve("9")).status).toBe(404);
	});

	test("a file too large for a function response is stored once and served by a signed link", async () => {
		const stored = new Map<string, Uint8Array>();
		const storage: FileStorage = {
			exists: async (key) => stored.has(key),
			put: async (key, body) => {
				stored.set(key, body);
			},
			url: async (key, type, disposition) =>
				`https://storage.test/${key}?type=${type}&d=${encodeURIComponent(disposition)}`,
		};
		const big = {
			"3": {
				mimeType: "application/pdf",
				filename: "deck.pdf",
				size: DIRECT_MAX_BYTES + 1,
			},
		};
		const token = tickets.sign({
			o: ORG,
			u: "user-1",
			m: "1a0fb9ddcfe52482",
			p: "3",
		});
		const first = await serveGmailFile(
			token,
			tickets.read,
			account(big) as never,
			storage,
		);
		expect(first.status).toBe(302);
		expect((await first.arrayBuffer()).byteLength).toBe(0);
		expect(first.headers.get("location")).toStartWith(
			`https://storage.test/inbox-files/gmail/${ORG}/user-1/1a0fb9ddcfe52482/3?type=application/octet-stream`,
		);
		expect(new TextDecoder().decode(stored.values().next().value)).toBe(
			"bytes of att-3",
		);
		stored.set([...stored.keys()][0] as string, new Uint8Array());
		const again = await serveGmailFile(
			token,
			tickets.read,
			account(big) as never,
			storage,
		);
		expect(again.status).toBe(302);
		expect(stored.size).toBe(1);
	});
});
