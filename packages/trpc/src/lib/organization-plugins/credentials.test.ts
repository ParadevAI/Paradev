import { describe, expect, test } from "bun:test";
import { type CredentialDeps, sourceToken } from "./credentials";

const source = { organizationId: "org", addedByUserId: "alice" };

const deps = (overrides: Partial<CredentialDeps> = {}): CredentialDeps => ({
	memberRole: async () => "admin",
	userToken: async () => "alice-token",
	...overrides,
});

describe("sourceToken", () => {
	test("reads with the GitHub account of the admin who added the source", async () => {
		expect(await sourceToken(source, deps())).toBe("alice-token");
	});

	test("an admin who left or was demoted is not read as", async () => {
		await expect(
			sourceToken(source, deps({ memberRole: async () => null })),
		).rejects.toThrow(/no longer an admin; have another admin add/);
		await expect(
			sourceToken(source, deps({ memberRole: async () => "member" })),
		).rejects.toThrow(/no longer an admin/);
		await expect(
			sourceToken({ ...source, addedByUserId: null }, deps()),
		).rejects.toThrow(/has left/);
	});

	test("an admin without GitHub connected is asked to reconnect", async () => {
		await expect(
			sourceToken(source, deps({ userToken: async () => null })),
		).rejects.toThrow(/reconnect GitHub/);
	});
});
