import { describe, expect, test } from "bun:test";
import { isAccountInCloud } from "./cloudAccountState";

describe("isAccountInCloud", () => {
	test("matches the account whose email is the cloud label", () => {
		expect(
			isAccountInCloud({
				email: "A@x.dev",
				cloudAccountLabel: "a@x.dev",
				cloudConfigured: true,
			}),
		).toBe(true);
	});

	test("does not match another account", () => {
		expect(
			isAccountInCloud({
				email: "b@x.dev",
				cloudAccountLabel: "a@x.dev",
				cloudConfigured: true,
			}),
		).toBe(false);
	});

	test("does not match a cloud sign-in saved without an email", () => {
		expect(
			isAccountInCloud({
				email: "a@x.dev",
				cloudAccountLabel: null,
				cloudConfigured: true,
			}),
		).toBe(false);
	});

	test("does not match when cloud has no sign-in", () => {
		expect(
			isAccountInCloud({
				email: "a@x.dev",
				cloudAccountLabel: "a@x.dev",
				cloudConfigured: false,
			}),
		).toBe(false);
	});
});
