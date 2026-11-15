import { describe, expect, test } from "bun:test";
import { billingAccess } from "./billingAccess";
import { billingMode } from "./billingMode";
import type { BillingMode } from "./billingMode.types";

const HOST = "app.example.test";
const NO_ACCESS = {
	canUpgrade: false,
	canManagePlan: false,
	upgradeHost: null,
};

function access(mode: BillingMode, isPaid: boolean, isOwner = true) {
	return billingAccess(mode, { isOwner, isPaid, host: HOST });
}

describe("billingMode", () => {
	test("Android names the host in plain text", async () => {
		expect(await billingMode()).toBe("text");
	});
});

describe("billingAccess", () => {
	test("iOS offers no link and names no host, paid or not", () => {
		const none: BillingMode = "none";
		for (const isPaid of [false, true]) {
			for (const isOwner of [false, true]) {
				expect(access(none, isPaid, isOwner)).toEqual(NO_ACCESS);
			}
		}
	});

	test("Android Free names the host to its owner and links nowhere", () => {
		expect(access("text", false)).toEqual({
			canUpgrade: false,
			canManagePlan: false,
			upgradeHost: HOST,
		});
		expect(access("text", false, false)).toEqual(NO_ACCESS);
	});

	test("Android paid links to plan management only", () => {
		expect(access("text", true)).toEqual({
			canUpgrade: false,
			canManagePlan: true,
			upgradeHost: null,
		});
	});

	test("the web links, and only an owner buys", () => {
		expect(access("link", false)).toEqual({
			canUpgrade: true,
			canManagePlan: true,
			upgradeHost: null,
		});
		expect(access("link", false, false).canUpgrade).toBe(false);
	});
});
