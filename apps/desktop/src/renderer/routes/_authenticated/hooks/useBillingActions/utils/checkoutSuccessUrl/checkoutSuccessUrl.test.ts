import { describe, expect, test } from "bun:test";
import { checkoutSuccessUrl } from "./checkoutSuccessUrl";

describe("checkoutSuccessUrl", () => {
	test("tells the web success page which desktop to return to", () => {
		expect(checkoutSuccessUrl("https://app.paradev.ai", "superset")).toBe(
			"https://app.paradev.ai/settings/billing?success=true&desktop_protocol=superset",
		);
		expect(
			checkoutSuccessUrl("http://localhost:3000", "superset-my-worktree"),
		).toBe(
			"http://localhost:3000/settings/billing?success=true&desktop_protocol=superset-my-worktree",
		);
	});
});
