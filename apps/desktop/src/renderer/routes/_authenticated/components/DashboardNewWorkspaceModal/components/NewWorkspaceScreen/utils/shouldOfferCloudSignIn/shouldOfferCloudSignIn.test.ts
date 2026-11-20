import { describe, expect, test } from "bun:test";
import { shouldOfferCloudSignIn } from "./shouldOfferCloudSignIn";

const base = {
	cloudPresetId: "claude",
	credentialsLoaded: true,
	configured: false,
	declined: [] as string[],
};

describe("shouldOfferCloudSignIn", () => {
	test("offers when a cloud agent has no cloud sign-in", () => {
		expect(shouldOfferCloudSignIn(base)).toBe(true);
	});

	test("stays quiet once the agent is signed in for cloud", () => {
		expect(shouldOfferCloudSignIn({ ...base, configured: true })).toBe(false);
	});

	test("stays quiet until the cloud sign-ins have loaded", () => {
		expect(shouldOfferCloudSignIn({ ...base, credentialsLoaded: false })).toBe(
			false,
		);
	});

	test("stays quiet for an agent the user declined", () => {
		expect(shouldOfferCloudSignIn({ ...base, declined: ["claude"] })).toBe(
			false,
		);
		expect(
			shouldOfferCloudSignIn({
				...base,
				cloudPresetId: "codex",
				declined: ["claude"],
			}),
		).toBe(true);
	});

	test("never offers for a device workspace", () => {
		expect(shouldOfferCloudSignIn({ ...base, cloudPresetId: null })).toBe(
			false,
		);
	});
});
