import { describe, expect, it } from "bun:test";
import { isStaffEmail, isTestAccountEmail } from "./constants";

describe("isTestAccountEmail", () => {
	it("matches only the exact test domain, in any case", () => {
		expect(isTestAccountEmail("onboarding-bot@e2e.paradev.com")).toBe(true);
		expect(isTestAccountEmail("Onboarding-Bot@E2E.Paradev.com")).toBe(true);
		expect(isTestAccountEmail("someone@paradev.com")).toBe(false);
		expect(isTestAccountEmail("someone@superset.sh")).toBe(false);
		expect(isTestAccountEmail("someone@xe2e.paradev.com")).toBe(false);
		expect(isTestAccountEmail("someone@e2e.paradev.com.evil.io")).toBe(false);
		expect(isTestAccountEmail("e2e.paradev.com")).toBe(false);
	});

	it("is not a staff email", () => {
		expect(isStaffEmail("onboarding-bot@e2e.paradev.com")).toBe(false);
	});
});
