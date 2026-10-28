import { describe, expect, it } from "bun:test";
import { useDismissedLimitWarnings } from "./dismissedLimitWarnings";

describe("useDismissedLimitWarnings", () => {
	it("forgets an account's dismissals once its usage falls back", () => {
		const { dismiss, release } = useDismissedLimitWarnings.getState();
		dismiss("account-a:five_hour:null:80");
		dismiss("account-b:weekly:2026-10-29:80");

		release("account-a:");

		expect([...useDismissedLimitWarnings.getState().keys]).toEqual([
			"account-b:weekly:2026-10-29:80",
		]);
	});
});
