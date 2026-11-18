import { describe, expect, test } from "bun:test";
import { signInSocial } from "./signInSocial";

describe("signInSocial", () => {
	test("throws the server's message when sign-in fails", async () => {
		const social = async () => ({
			error: { message: "Account is suspended", statusText: "Forbidden" },
		});
		await expect(signInSocial(social, { provider: "github" })).rejects.toThrow(
			"Account is suspended",
		);
	});

	test("falls back to the status text when there is no message", async () => {
		const social = async () => ({ error: { statusText: "Bad Gateway" } });
		await expect(signInSocial(social, { provider: "google" })).rejects.toThrow(
			"Bad Gateway",
		);
	});

	test("resolves when sign-in succeeds or the browser is dismissed", async () => {
		const social = async () => ({ error: null });
		await expect(
			signInSocial(social, { provider: "github" }),
		).resolves.toBeUndefined();
	});
});
