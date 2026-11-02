import { describe, expect, test } from "bun:test";
import { storedTokenToRestore } from "./storedTokenToRestore";

describe("storedTokenToRestore", () => {
	test("restores a token whose sign-in expiry has passed", () => {
		expect(
			storedTokenToRestore({
				token: "session-token",
				expiresAt: "2020-01-01T00:00:00.000Z",
			}),
		).toBe("session-token");
	});

	test("restores nothing when no token is stored", () => {
		expect(storedTokenToRestore({ token: null, expiresAt: null })).toBeNull();
		expect(storedTokenToRestore(undefined)).toBeNull();
	});
});
