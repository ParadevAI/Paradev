import { describe, expect, test } from "bun:test";
import type { PostHog } from "posthog-js/react";
import { createPostHogIdentity } from "./posthog-identity";

function fakePostHog({ optedOut = false, optOutByDefault = false } = {}) {
	const calls: string[] = [];
	const state = {
		optedOut,
		storedConsent: null as "in" | "out" | null,
		disableFlags: false,
		flagProperties: { email: "someone@example.com" } as Record<string, unknown>,
		received: [] as unknown[],
	};
	const record =
		(name: string) =>
		(..._args: unknown[]) => {
			calls.push(name);
		};
	const posthog = {
		__loaded: true,
		has_opted_out_capturing: () => state.optedOut,
		opt_in_capturing: () => {
			calls.push("opt_in_capturing");
			state.optedOut = false;
			state.storedConsent = "in";
		},
		opt_out_capturing: () => {
			calls.push("opt_out_capturing");
			state.optedOut = true;
			state.storedConsent = "out";
		},
		identify: record("identify"),
		setPersonProperties: record("setPersonProperties"),
		setPersonPropertiesForFlags: record("setPersonPropertiesForFlags"),
		resetPersonPropertiesForFlags: () => {
			calls.push("resetPersonPropertiesForFlags");
			state.flagProperties = {};
		},
		reloadFeatureFlags: record("reloadFeatureFlags"),
		stopSessionRecording: record("stopSessionRecording"),
		people: { set: record("people.set"), set_once: record("people.set_once") },
		set_config: (config: { advanced_disable_flags?: boolean }) => {
			state.disableFlags = config.advanced_disable_flags ?? state.disableFlags;
		},
		_shouldDisableFlags: () => state.disableFlags,
		featureFlags: {
			receivedFeatureFlags: (response: unknown) => {
				state.received.push(response);
			},
		},
		reset: () => {
			calls.push("reset");
			state.storedConsent = null;
			state.optedOut = optOutByDefault;
		},
	};
	return { posthog: posthog as unknown as PostHog, calls, state };
}

function setup(
	options: {
		optedOut?: boolean;
		optOutByDefault?: boolean;
		flagsDisabled?: boolean;
	} = {},
) {
	const fake = fakePostHog(options);
	fake.state.disableFlags = options.flagsDisabled ?? false;
	const requests: unknown[] = [];
	const identity = createPostHogIdentity({
		posthog: fake.posthog,
		fetchFlags: async (request) => {
			requests.push(request);
			return { flags: { "cloud-workspaces": { enabled: true } } };
		},
	});
	return { ...fake, identity, requests };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("postHogIdentity with telemetry off", () => {
	test("flag requests carry only the user id and plan tier", async () => {
		const { identity, calls, requests, state } = setup({
			flagsDisabled: true,
		});
		identity.start(false);
		identity.identifyUser("user-1", { email: "someone@example.com" });
		identity.setPlanTier("pro");
		identity.setPeople({ app_locale: "en" });
		identity.setPeopleOnce({ onboarded_surface: "v2" });
		await flush();

		expect(requests.at(-1)).toEqual({
			distinct_id: "user-1",
			person_properties: { plan_tier: "pro" },
		});
		expect(state.received.length).toBeGreaterThan(0);
		expect(calls).not.toContain("identify");
		expect(calls).not.toContain("setPersonProperties");
		expect(calls).not.toContain("setPersonPropertiesForFlags");
		expect(calls).not.toContain("people.set");
		expect(calls).not.toContain("people.set_once");
	});

	test("turning it off clears stored flag properties and stops PostHog's own flag request", async () => {
		const { identity, state, requests } = setup();
		identity.start(true);
		identity.identifyUser("user-1", { email: "someone@example.com" });
		identity.apply(false);
		await flush();

		expect(state.flagProperties).toEqual({});
		expect(state.disableFlags).toBe(true);
		expect(requests.at(-1)).toEqual({
			distinct_id: "user-1",
			person_properties: {},
		});
	});
});

describe("PostHog consent follows the setting", () => {
	test("a launch with the setting on opts back in after an earlier opt-out", () => {
		const { identity, state } = setup({ optedOut: true });
		identity.start(true);
		expect(state.optedOut).toBe(false);
	});

	test("a launch with the setting off opts out", () => {
		const { identity, state } = setup();
		identity.start(false);
		expect(state.optedOut).toBe(true);
	});

	test("an unchanged setting still corrects a consent state that drifted", () => {
		const { identity, state } = setup();
		identity.start(true);
		state.optedOut = true;
		identity.apply(true);
		expect(state.optedOut).toBe(false);
	});

	test("sign-out keeps the opt-out", () => {
		const { identity, state } = setup({ flagsDisabled: true });
		identity.start(false);
		identity.reset();
		expect(state.optedOut).toBe(true);
	});

	test("sign-out in a window launched with it off writes the opt-out back for other windows", () => {
		const { identity, state } = setup({
			optedOut: true,
			optOutByDefault: true,
			flagsDisabled: true,
		});
		identity.start(false);
		identity.reset();
		expect(state.storedConsent).toBe("out");
	});
});
