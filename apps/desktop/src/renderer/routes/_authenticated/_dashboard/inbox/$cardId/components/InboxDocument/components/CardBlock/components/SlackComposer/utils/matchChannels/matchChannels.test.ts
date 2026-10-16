import { describe, expect, test } from "bun:test";
import { matchChannels } from "./matchChannels";

describe("matchChannels", () => {
	const channels = {
		C1: "test-agents",
		C2: "bugs",
		C3: "general",
		C4: "agents",
		C5: "debugs-later",
	};

	test("prefix matches first, then contains, each alphabetically", () => {
		expect(matchChannels(channels, "ag").map((c) => c.name)).toEqual([
			"agents",
			"test-agents",
		]);
		expect(matchChannels(channels, "bug").map((c) => c.name)).toEqual([
			"bugs",
			"debugs-later",
		]);
	});

	test("#test lists test-agents before testing, as Slack does", () => {
		expect(
			matchChannels({ C1: "testing", C2: "test-agents" }, "test").map(
				(c) => c.name,
			),
		).toEqual(["test-agents", "testing"]);
	});

	test("an empty query lists every channel alphabetically, up to the limit", () => {
		expect(matchChannels(channels, "", 2).map((c) => c.name)).toEqual([
			"agents",
			"bugs",
		]);
	});
});
