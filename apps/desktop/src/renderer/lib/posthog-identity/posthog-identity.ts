import type { PostHog } from "posthog-js/react";

type Properties = Record<string, unknown>;

interface MinimalFlagsRequest {
	distinct_id: string;
	person_properties: Properties;
}

interface PostHogIdentityDeps {
	posthog: PostHog;
	fetchFlags: (request: MinimalFlagsRequest) => Promise<unknown>;
}

export function createPostHogIdentity({
	posthog,
	fetchFlags,
}: PostHogIdentityDeps) {
	let enabled = true;
	let user: { id: string; properties: Properties; flags: Properties } | null =
		null;
	let planTier: string | null = null;
	const people: Properties = {};
	const peopleOnce: Properties = {};
	let flagsRequest = 0;

	const ready = () => posthog.__loaded;

	function syncConsent() {
		if (enabled === !posthog.has_opted_out_capturing()) return;
		if (enabled) posthog.opt_in_capturing();
		else posthog.opt_out_capturing();
	}

	async function refreshMinimalFlags() {
		if (!user || !posthog._shouldDisableFlags()) return;
		const request = ++flagsRequest;
		const response = await fetchFlags({
			distinct_id: user.id,
			person_properties: {
				...(enabled ? user.flags : {}),
				...(planTier ? { plan_tier: planTier } : {}),
			},
		});
		if (
			response &&
			request === flagsRequest &&
			ready() &&
			posthog._shouldDisableFlags()
		) {
			posthog.featureFlags.receivedFeatureFlags(response as never);
		}
	}

	function sendIdentity() {
		if (!user) return;
		posthog.identify(user.id, user.properties);
		if (Object.keys(user.flags).length > 0) {
			posthog.setPersonPropertiesForFlags(user.flags, false);
		}
		if (planTier) {
			posthog.setPersonProperties({ plan_tier: planTier });
			posthog.setPersonPropertiesForFlags({ plan_tier: planTier }, false);
		}
		if (Object.keys(people).length > 0) posthog.people.set(people);
		if (Object.keys(peopleOnce).length > 0) posthog.people.set_once(peopleOnce);
		posthog.reloadFeatureFlags();
	}

	return {
		start(telemetryEnabled: boolean) {
			enabled = telemetryEnabled;
			if (!ready()) return;
			syncConsent();
			if (!enabled) posthog.resetPersonPropertiesForFlags();
		},

		apply(telemetryEnabled: boolean) {
			const changed = telemetryEnabled !== enabled;
			enabled = telemetryEnabled;
			if (!ready()) return;
			syncConsent();
			if (!changed) return;
			if (enabled) {
				posthog.set_config({ advanced_disable_flags: false });
				sendIdentity();
				void refreshMinimalFlags();
				return;
			}
			posthog.stopSessionRecording();
			posthog.resetPersonPropertiesForFlags();
			posthog.set_config({ advanced_disable_flags: true });
			void refreshMinimalFlags();
		},

		identifyUser(id: string, properties: Properties, flags: Properties = {}) {
			user = { id, properties, flags };
			if (!ready()) return;
			if (!enabled) {
				void refreshMinimalFlags();
				return;
			}
			posthog.identify(id, properties);
			if (Object.keys(flags).length > 0) {
				posthog.setPersonPropertiesForFlags(flags, false);
			}
			posthog.reloadFeatureFlags();
			void refreshMinimalFlags();
		},

		setPlanTier(tier: string) {
			planTier = tier;
			if (!ready()) return;
			if (!enabled) {
				void refreshMinimalFlags();
				return;
			}
			posthog.setPersonProperties({ plan_tier: tier });
			posthog.setPersonPropertiesForFlags({ plan_tier: tier });
			void refreshMinimalFlags();
		},

		setPeople(properties: Properties) {
			Object.assign(people, properties);
			if (ready() && enabled) posthog.people.set(properties);
		},

		setPeopleOnce(properties: Properties) {
			for (const [key, value] of Object.entries(properties)) {
				if (!(key in peopleOnce)) peopleOnce[key] = value;
			}
			if (ready() && enabled) posthog.people.set_once(properties);
		},

		reset() {
			user = null;
			planTier = null;
			for (const key of Object.keys(people)) delete people[key];
			for (const key of Object.keys(peopleOnce)) delete peopleOnce[key];
			flagsRequest++;
			if (!ready()) return;
			posthog.reset();
			if (enabled) posthog.opt_in_capturing({ captureEventName: false });
			else posthog.opt_out_capturing();
		},
	};
}

export type PostHogIdentity = ReturnType<typeof createPostHogIdentity>;
