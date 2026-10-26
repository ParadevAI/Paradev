import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { AccountCard } from "./UsageView";

afterEach(cleanup);

test("transport loss keeps dashboard quota and wallet visibly historical without changing their dates", () => {
	const measuredAt = new Date();
	const account: UsageAccount = {
		agent: "claude",
		accountKey: "fixture",
		sourceLabel: "Fixture",
		credentialKind: "subscription",
		email: null,
		plan: "Max",
		status: "ok",
		statusDetail: null,
		windows: [
			{
				id: "seven_day",
				label: "Weekly",
				usedPercent: 24,
				resetsAt: new Date(measuredAt.getTime() + 86_400_000),
				observedAt: measuredAt,
				source: "provider",
			},
		],
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		isDefault: true,
		fetchedAt: measuredAt,
		prepaidBalance: { amount: 12.34, currency: "USD", checkedAt: measuredAt },
	};
	const props = {
		account,
		onMakeDefault: null,
		onSwitchSignIn: null,
		onRemove: null,
		isSwitching: false,
		selectable: false,
		hideEmails: false,
	};
	const view = render(<AccountCard {...props} />);
	expect(view.getByText("24%")).toBeTruthy();
	expect(view.getByText("$12.34")).toBeTruthy();
	view.rerender(<AccountCard {...props} offline />);
	expect(view.getByText("~24%")).toBeTruthy();
	expect(view.getByText("~$12.34")).toBeTruthy();
	expect(view.getByText(/Last checked.*not live/)).toBeTruthy();
	expect(account.fetchedAt).toBe(measuredAt);
	expect(account.prepaidBalance?.checkedAt).toBe(measuredAt);
});
