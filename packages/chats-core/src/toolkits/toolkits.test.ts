import { describe, expect, test } from "bun:test";
import {
	toolkitDescription,
	toolkitLetter,
	toolkitMark,
	toolkitName,
} from "./toolkits.ts";

describe("toolkitName", () => {
	test("names the toolkits Dev knows", () => {
		expect(toolkitName("linear")).toBe("Linear");
		expect(toolkitName("GMAIL")).toBe("Gmail");
		expect(toolkitName("google_calendar")).toBe("Google Calendar");
		expect(
			[
				"github",
				"slack",
				"stripe",
				"ynab",
				"vercel",
				"posthog",
				"typefully",
				"autumn",
			].map(toolkitName),
		).toEqual([
			"GitHub",
			"Slack",
			"Stripe",
			"YNAB",
			"Vercel",
			"PostHog",
			"Typefully",
			"Autumn",
		]);
	});

	test("capitalises an unknown slug", () => {
		expect(toolkitName("acme")).toBe("Acme");
		expect(toolkitName("")).toBe("");
	});
});

describe("toolkitMark", () => {
	test("finds a toolkit's brand mark by its Composio slug", () => {
		expect(toolkitMark("gmail")?.file).toBe("gmail");
		expect(toolkitMark("LINEAR")?.file).toBe("linear");
		expect(toolkitMark("github")?.file).toBe("github");
		for (const slug of [
			"slack",
			"stripe",
			"ynab",
			"vercel",
			"posthog",
			"typefully",
			"autumn",
		])
			expect(toolkitMark(slug)?.file).toBe(slug as never);
	});

	test("maps Google Calendar's slugs, however Composio writes them, to its mark", () => {
		expect(toolkitMark("googlecalendar")?.file).toBe("google-calendar");
		expect(toolkitMark("google_calendar")?.file).toBe("google-calendar");
		expect(toolkitMark("google-calendar")?.file).toBe("google-calendar");
	});

	test("has none for an app without a mark", () => {
		expect(toolkitMark("hubspot")).toBeUndefined();
		expect(toolkitMark("constructor")).toBeUndefined();
	});
});

test("a toolkit without a mark shows its name's initial", () => {
	expect(toolkitLetter("hubspot")).toBe("H");
	expect(toolkitLetter("googlecalendar")).toBe("G");
});

test("known toolkits have a line about what they do, others none", () => {
	expect(toolkitDescription("gmail")).toBe("Read and act on your email");
	expect(toolkitDescription("google_calendar")).toBe(
		"Your events and invitations",
	);
	expect(toolkitDescription("posthog")).toBe(
		"Product analytics, errors and feature flags",
	);
	expect(toolkitDescription("hubspot")).toBeNull();
});
