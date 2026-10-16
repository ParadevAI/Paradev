import { describe, expect, test } from "bun:test";
import { mondayMorning, slackWhen, tomorrowMorning } from "./slackWhen";

const ZONE = "America/Los_Angeles";
const at = (iso: string) => Date.parse(iso);

describe("slackWhen", () => {
	test("writes the time in the reader's Slack zone", () => {
		expect(slackWhen(at("2037-10-01T23:00:00Z"), ZONE)).toBe(
			"Oct 1 at 4:00 PM",
		);
		expect(slackWhen(at("2037-10-01T23:00:00Z"), "Asia/Tokyo")).toBe(
			"Oct 2 at 8:00 AM",
		);
	});
});

describe("presets", () => {
	test("tomorrow at 9:00 in the zone, across a day line", () => {
		expect(
			new Date(tomorrowMorning(at("2037-10-02T05:30:00Z"), ZONE)).toISOString(),
		).toBe("2037-10-02T16:00:00.000Z");
	});

	test("the Monday after tomorrow", () => {
		const monday = (iso: string) =>
			new Date(mondayMorning(at(iso), ZONE)).toISOString();
		expect(monday("2037-10-01T19:00:00Z")).toBe("2037-10-05T16:00:00.000Z");
		expect(monday("2037-10-04T19:00:00Z")).toBe("2037-10-12T16:00:00.000Z");
		expect(monday("2037-10-05T19:00:00Z")).toBe("2037-10-12T16:00:00.000Z");
	});
});
