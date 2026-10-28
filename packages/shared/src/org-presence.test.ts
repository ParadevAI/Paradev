import { describe, expect, test } from "bun:test";
import {
	parseOrgPresenceMessage,
	parseOrgPresenceReport,
	summarizeOrgPresence,
} from "./org-presence";

describe("org presence", () => {
	test("any window in use makes a person active", () => {
		expect(
			summarizeOrgPresence([
				{ userId: "a", status: "away" },
				{ userId: "a", status: "active" },
				{ userId: "b", status: "away" },
			]),
		).toEqual({ a: "active", b: "away" });
	});

	test("parses only well-formed presence frames", () => {
		expect(
			parseOrgPresenceMessage(
				JSON.stringify({ type: "presence", users: { a: "active", b: "gone" } }),
			),
		).toEqual({ type: "presence", users: { a: "active" } });
		expect(
			parseOrgPresenceMessage(JSON.stringify({ type: "nudge" })),
		).toBeNull();
		expect(
			parseOrgPresenceReport(
				JSON.stringify({ type: "presence", status: "away" }),
			),
		).toEqual({ type: "presence", status: "away" });
		expect(parseOrgPresenceReport("ping")).toBeNull();
	});
});
