import { expect, test } from "bun:test";
import { isKeepAwakeSupported, powerAllowsKeepAwake } from "./macos";

test.each([
	["Now drawing from 'AC Power'\n", true],
	["Now drawing from 'AC Power'\n -InternalBattery-0\t5%; charging;\n", true],
	[
		"Now drawing from 'Battery Power'\n -InternalBattery-0\t9%; discharging;",
		false,
	],
	[
		"Now drawing from 'Battery Power'\n -InternalBattery-0\t10%; discharging;",
		true,
	],
	[
		"Now drawing from 'Battery Power'\n -InternalBattery-0\t100%; discharging;",
		true,
	],
	[
		"Now drawing from 'Battery Power'\n -InternalBattery-0\t101%; discharging;",
		false,
	],
	[
		"Now drawing from 'Battery Power'\n -InternalBattery-0\t-15%; discharging;",
		false,
	],
	["Now drawing from 'Battery Power'\n", false],
	["unrecognized output", false],
	["", false],
])("power snapshot %j permits protection: %s", (snapshot, allowed) => {
	expect(powerAllowsKeepAwake(snapshot)).toBe(allowed);
});

test("only non-sandbox macOS hosts support keep-awake", () => {
	expect(isKeepAwakeSupported("darwin", "local")).toBe(true);
	expect(isKeepAwakeSupported("darwin", "sandbox")).toBe(false);
	expect(isKeepAwakeSupported("linux", "local")).toBe(false);
	expect(isKeepAwakeSupported("win32", "local")).toBe(false);
});
