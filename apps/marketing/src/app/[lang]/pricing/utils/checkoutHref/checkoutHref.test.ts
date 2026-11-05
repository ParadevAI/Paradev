import { describe, expect, test } from "bun:test";
import { checkoutHref } from "./checkoutHref";

describe("checkoutHref", () => {
	test("opens web billing with the plan and billing period picked", () => {
		expect(checkoutHref("https://app.superset.sh", "team", true)).toBe(
			"https://app.superset.sh/settings/billing?plan=team&interval=yearly",
		);
	});
});
