import { expect, test } from "bun:test";
import { isUsageLimitMessage } from "./envelope";

test("usage and spend refusals read as a usage limit; rate limits and other errors do not", () => {
	for (const message of [
		"You've hit your usage limit.",
		"Internal error: You've hit your Fable limit · resets Nov 24 at 2pm (America/Los_Angeles).",
		"You've hit your session limit · resets 3pm",
		"You've hit your Sonnet 4.5 limit",
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
		"You've hit your rate limit.",
		"You've hit your context window limit.",
		"You have hit your token limit for this request.",
		"You've hit your file size limit.",
		"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.",
		"acp agent exited (code 1)",
		"prompt is too long",
	]) {
		expect(isUsageLimitMessage(message)).toBe(false);
	}
});
