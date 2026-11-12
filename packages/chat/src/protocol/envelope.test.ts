import { expect, test } from "bun:test";
import { isUsageLimitMessage } from "./envelope";

test("usage and spend refusals read as a usage limit; rate limits and other errors do not", () => {
	for (const message of [
		"You've hit your usage limit.",
		"Claude AI usage limit reached|1794450000",
		"You have reached your specified workspace API usage limits.",
		"You've hit your org's monthly spend limit",
		"Spend limit exceeded",
		"You exceeded your current quota, please check your plan.",
		"Your credit balance is too low to access the Anthropic API.",
	]) {
		expect(isUsageLimitMessage(message)).toBe(true);
	}
	for (const message of [
		"Rate limit exceeded. Try again in 20s.",
		"acp agent exited (code 1)",
		"prompt is too long",
	]) {
		expect(isUsageLimitMessage(message)).toBe(false);
	}
});
