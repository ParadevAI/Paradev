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

	test.each([
		["{not json"],
		[""],
		['{"enabled":false'],
		['{"enabled":"false"}'],
		['{"enabled":0}'],
		["null"],
		["{}"],
	])("a file that cannot be read as a choice reads as off: %p", (text) => {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, text);
		expect(readTelemetrySetting(filePath)).toBe(false);
	});

	test("a path that exists but is not a file reads as off", () => {
		fs.mkdirSync(filePath, { recursive: true });
		expect(readTelemetrySetting(filePath)).toBe(false);
	});

	test("a write replaces the file in one step and leaves no temp file", () => {
		writeTelemetrySetting(true, filePath);
		const renames: string[] = [];
		const realRename = fs.renameSync;
		fs.renameSync = ((from: string, to: string) => {
			renames.push(to);
			expect(readTelemetrySetting(filePath)).toBe(true);
			realRename(from, to);
		}) as typeof fs.renameSync;
		try {
			writeTelemetrySetting(false, filePath);
		} finally {
			fs.renameSync = realRename;
		}
		expect(renames).toEqual([filePath]);
		expect(readTelemetrySetting(filePath)).toBe(false);
		expect(fs.readdirSync(path.dirname(filePath))).toEqual(["telemetry.json"]);
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
