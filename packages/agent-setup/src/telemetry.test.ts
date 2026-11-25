import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	isDoNotTrackSet,
	isTelemetryEnabled,
	readTelemetrySetting,
	writeTelemetrySetting,
} from "./telemetry";

let dir: string;
let filePath: string;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetry-setting-"));
	filePath = path.join(dir, "home", "telemetry.json");
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

describe("telemetry setting", () => {
	test("is on when nothing is stored", () => {
		expect(readTelemetrySetting(filePath)).toBe(true);
		expect(isTelemetryEnabled({ env: {}, filePath })).toBe(true);
	});

	test("round-trips the stored choice", () => {
		writeTelemetrySetting(false, filePath);
		expect(readTelemetrySetting(filePath)).toBe(false);
		expect(isTelemetryEnabled({ env: {}, filePath })).toBe(false);

		writeTelemetrySetting(true, filePath);
		expect(isTelemetryEnabled({ env: {}, filePath })).toBe(true);
	});

	test("a corrupt file reads as on", () => {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, "{not json");
		expect(readTelemetrySetting(filePath)).toBe(true);
	});

	test("DO_NOT_TRACK turns it off whatever is stored", () => {
		writeTelemetrySetting(true, filePath);
		expect(isTelemetryEnabled({ env: { DO_NOT_TRACK: "1" }, filePath })).toBe(
			false,
		);
	});

	test.each([
		["1", true],
		["true", true],
		["yes", true],
		["0", false],
		["false", false],
		["", false],
		[undefined, false],
	])("DO_NOT_TRACK=%p is set: %p", (value, expected) => {
		expect(isDoNotTrackSet({ DO_NOT_TRACK: value })).toBe(expected);
	});
});
