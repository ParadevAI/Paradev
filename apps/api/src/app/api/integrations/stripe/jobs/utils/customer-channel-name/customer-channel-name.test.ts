import { describe, expect, test } from "bun:test";
import { customerChannelName } from "./customer-channel-name";

describe("customerChannelName", () => {
	test("follows the ext-<company>-paradev convention", () => {
		expect(customerChannelName("Wenbrooke's Team", "cus_123")).toBe(
			"ext-wenbrookes-team-paradev",
		);
		expect(customerChannelName("Café Ünïcode & Co.", "cus_123")).toBe(
			"ext-cafe-unicode-co-paradev",
		);
	});

	test("falls back to the Stripe customer when the name has no usable characters", () => {
		expect(customerChannelName("株式会社", "cus_ABC")).toBe(
			"ext-cus_abc-paradev",
		);
	});

	test("stays within Slack's 80 character limit", () => {
		const name = customerChannelName("a".repeat(200), "cus_123");
		expect(name.length).toBe(80);
		expect(name.endsWith("-paradev")).toBe(true);
	});
});
