import { describe, expect, test } from "bun:test";
import { signPageTicket, verifyPageTicket } from "./ticket";

const SECRET = "a".repeat(32);
const OTHER = "b".repeat(32);
const NOW = 1_790_000_000_000;
const EXP = Math.floor(NOW / 1000) + 3600;
const PAGE = "d28d7b35-813f-43a0-b3f9-9d8988dd1d58";

describe("page tickets", () => {
	test("round-trips claims, with and without a version", async () => {
		const bare = await signPageTicket(SECRET, { pageId: PAGE, exp: EXP });
		expect(await verifyPageTicket(SECRET, bare, NOW)).toEqual({
			pageId: PAGE,
			exp: EXP,
		});

		const bound = await signPageTicket(SECRET, {
			pageId: PAGE,
			version: 3,
			exp: EXP,
		});
		expect(await verifyPageTicket(SECRET, bound, NOW)).toEqual({
			pageId: PAGE,
			version: 3,
			exp: EXP,
		});
	});

	test("identical claims give an identical ticket (cache-stable URLs)", async () => {
		const a = await signPageTicket(SECRET, { pageId: PAGE, exp: EXP });
		const b = await signPageTicket(SECRET, { pageId: PAGE, exp: EXP });
		expect(a).toBe(b);
	});

	test("rejects an expired ticket, exactly at and after expiry", async () => {
		const ticket = await signPageTicket(SECRET, { pageId: PAGE, exp: EXP });
		expect(await verifyPageTicket(SECRET, ticket, EXP * 1000)).toBeNull();
		expect(
			await verifyPageTicket(SECRET, ticket, EXP * 1000 - 1),
		).not.toBeNull();
	});

	test("rejects the wrong secret; accepts a rotated-out secret in the list", async () => {
		const ticket = await signPageTicket(SECRET, { pageId: PAGE, exp: EXP });
		expect(await verifyPageTicket(OTHER, ticket, NOW)).toBeNull();
		expect(await verifyPageTicket([OTHER, SECRET], ticket, NOW)).not.toBeNull();
		expect(await verifyPageTicket([OTHER, ""], ticket, NOW)).toBeNull();
	});

	test("rejects a tampered payload", async () => {
		const ticket = await signPageTicket(SECRET, { pageId: PAGE, exp: EXP });
		const [payload = "", signature = ""] = ticket.split(".");
		const forged = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8"),
		);
		forged.pageId = "11111111-1111-4111-8111-111111111111";
		const tampered = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${signature}`;
		expect(await verifyPageTicket(SECRET, tampered, NOW)).toBeNull();
	});

	test("rejects a wrong kind even when correctly signed", async () => {
		const wire = { kind: "file", pageId: PAGE, exp: EXP };
		const payload = Buffer.from(JSON.stringify(wire)).toString("base64url");
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(SECRET),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const signature = Buffer.from(
			await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
		).toString("base64url");
		expect(
			await verifyPageTicket(SECRET, `${payload}.${signature}`, NOW),
		).toBeNull();
	});

	test("rejects malformed input", async () => {
		for (const bad of ["", "abc", "a.b", "!!.!!", "a.b.c"]) {
			expect(await verifyPageTicket(SECRET, bad, NOW)).toBeNull();
		}
	});
});
