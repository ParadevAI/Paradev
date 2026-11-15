import { describe, expect, test } from "bun:test";

import {
	desktopCheckoutReturnUrl,
	isDesktopProtocol,
} from "./desktop-protocol";

describe("isDesktopProtocol", () => {
	test("accepts the schemes the desktop registers", () => {
		expect(isDesktopProtocol("superset")).toBe(true);
		expect(isDesktopProtocol("superset-dev")).toBe(true);
		expect(isDesktopProtocol("superset-my-worktree2")).toBe(true);
		expect(isDesktopProtocol("Superset")).toBe(true);
	});

	test("rejects anything that could redirect the token elsewhere", () => {
		expect(isDesktopProtocol("https")).toBe(false);
		expect(isDesktopProtocol("https://attacker.example/?x=")).toBe(false);
		expect(isDesktopProtocol("superset://evil")).toBe(false);
		expect(isDesktopProtocol("superset-")).toBe(false);
		expect(isDesktopProtocol("supersets")).toBe(false);
		expect(isDesktopProtocol("javascript")).toBe(false);
		expect(isDesktopProtocol("")).toBe(false);
	});
});

describe("desktopCheckoutReturnUrl", () => {
	test("links the desktop that started checkout back to its billing page", () => {
		expect(desktopCheckoutReturnUrl("superset")).toBe(
			"superset://settings/billing?checkout=success",
		);
		expect(desktopCheckoutReturnUrl("superset-my-worktree")).toBe(
			"superset-my-worktree://settings/billing?checkout=success",
		);
	});

	test("returns null without a desktop protocol, so web checkout stays on web", () => {
		expect(desktopCheckoutReturnUrl(undefined)).toBeNull();
		expect(desktopCheckoutReturnUrl("")).toBeNull();
		expect(desktopCheckoutReturnUrl("https://attacker.example/?x=")).toBeNull();
		expect(desktopCheckoutReturnUrl("javascript")).toBeNull();
	});
});
