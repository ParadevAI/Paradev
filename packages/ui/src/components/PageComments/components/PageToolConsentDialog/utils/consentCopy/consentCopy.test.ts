import { describe, expect, test } from "bun:test";
import type { PageToolPrompt } from "../../../../hooks/usePageTools";
import { consentCopy } from "./consentCopy";

describe("consentCopy", () => {
	test("grant copy depends on accountless", () => {
		const account = consentCopy(
			{ kind: "grant", pluginLabel: "Neon" },
			"Report",
		);
		const accountless = consentCopy(
			{ kind: "grant", pluginLabel: "Exa", accountless: true },
			"Report",
		);
		expect(account.title.message).toBe("Allow this page to use Neon?");
		expect(account.body.message).toContain("in your Neon account");
		expect(accountless.body.message).toContain("Report can use Exa as you");
	});

	test("every kind has all four labels", () => {
		const prompts: PageToolPrompt[] = [
			{ kind: "install", pluginLabel: "Neon" },
			{ kind: "connect", pluginLabel: "Neon" },
			{ kind: "account", pluginLabel: "Neon", accounts: [] },
		];
		for (const prompt of prompts) {
			const copy = consentCopy(prompt, "Report");
			expect(Object.keys(copy).sort()).toEqual([
				"allow",
				"body",
				"deny",
				"title",
			]);
		}
	});
});
