import { describe, expect, test } from "bun:test";

import { isStaleIdentity } from "./isStaleIdentity";

describe("isStaleIdentity", () => {
	test("keeps an anonymous visitor so sign-in can merge it", () => {
		expect(
			isStaleIdentity({
				userId: "user-1",
				distinctId: "anon-from-marketing",
				userState: "anonymous",
			}),
		).toBe(false);
	});

	test("keeps an anonymous visitor who is signed out", () => {
		expect(
			isStaleIdentity({
				userId: null,
				distinctId: "anon-from-marketing",
				userState: "anonymous",
			}),
		).toBe(false);
	});

	test("keeps the same signed-in user", () => {
		expect(
			isStaleIdentity({
				userId: "user-1",
				distinctId: "user-1",
				userState: "identified",
			}),
		).toBe(false);
	});

	test("drops a user who signed out", () => {
		expect(
			isStaleIdentity({
				userId: null,
				distinctId: "user-1",
				userState: "identified",
			}),
		).toBe(true);
	});

	test("drops the previous user when another one signs in", () => {
		expect(
			isStaleIdentity({
				userId: "user-2",
				distinctId: "user-1",
				userState: "identified",
			}),
		).toBe(true);
	});
});
