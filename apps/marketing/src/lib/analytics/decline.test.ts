import { describe, expect, test } from "bun:test";

import { declineAnalytics, declineMarketingAnalytics } from "./decline";

test("revokes the bridge before the SDK callback is initialized", () => {
	const calls: string[] = [];
	declineMarketingAnalytics(
		() => {
			calls.push("queued SDK");
		},
		async () => {
			calls.push("revoke");
		},
	);
	expect(calls).toEqual(["revoke", "queued SDK"]);
});

function fakePosthog(userState: string | undefined) {
	const calls: string[] = [];
	return {
		calls,
		posthog: {
			get_property: (key: string) =>
				key === "$user_state" ? userState : undefined,
			reset: (resetDeviceId?: boolean) => {
				calls.push(resetDeviceId ? "reset(device)" : "reset");
			},
			opt_out_capturing: () => {
				calls.push("opt_out_capturing");
			},
		},
	};
}

describe("declineAnalytics", () => {
	test("drops the anonymous visitor before opting out", () => {
		const { calls, posthog } = fakePosthog("anonymous");
		declineAnalytics(posthog);
		expect(calls).toEqual(["reset(device)", "opt_out_capturing"]);
	});

	test("drops a visitor with no stored state", () => {
		const { calls, posthog } = fakePosthog(undefined);
		declineAnalytics(posthog);
		expect(calls).toEqual(["reset(device)", "opt_out_capturing"]);
	});

	test("keeps a signed-in user's identity and only opts out", () => {
		const { calls, posthog } = fakePosthog("identified");
		declineAnalytics(posthog);
		expect(calls).toEqual(["opt_out_capturing"]);
	});
});
