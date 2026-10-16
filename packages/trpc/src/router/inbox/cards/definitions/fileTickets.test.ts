import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { fileTickets } from "./fileTickets";

const schema = z.object({ f: z.string() });
const secret = "test-secret-test-secret-test-secret-00";

describe("fileTickets", () => {
	test("a ticket reads back, and not for another purpose, after tampering or past its expiry", () => {
		const a = fileTickets({ secret, purpose: "a", schema, ttlSeconds: 60 });
		const b = fileTickets({ secret, purpose: "b", schema, ttlSeconds: 60 });
		const later = fileTickets(
			{ secret, purpose: "a", schema, ttlSeconds: 60 },
			() => Date.now() + 2 * 3600_000,
		);
		const token = a.sign({ f: "one" });
		expect(a.read(token)).toEqual({ f: "one" });
		expect(b.read(token)).toBeNull();
		expect(a.read(`${token}x`)).toBeNull();
		expect(later.read(token)).toBeNull();
	});

	test("a file keeps one URL within the hour, so the browser cache holds", () => {
		const at = (ms: number) =>
			fileTickets({ secret, purpose: "a", schema, ttlSeconds: 60 }, () => ms);
		const hour = 3600_000;
		expect(at(5 * hour + 1_000).sign({ f: "one" })).toBe(
			at(5 * hour + 1_800_000).sign({ f: "one" }),
		);
	});
});
