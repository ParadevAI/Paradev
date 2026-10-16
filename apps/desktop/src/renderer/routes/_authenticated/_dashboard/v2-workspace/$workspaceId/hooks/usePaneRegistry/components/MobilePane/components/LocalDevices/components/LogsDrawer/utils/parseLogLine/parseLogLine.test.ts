import { describe, expect, test } from "bun:test";
import { parseAndroidLine, parseIosEvent } from "./parseLogLine";

// Samples captured from expo-device-hub 0.17.0.
describe("parseIosEvent", () => {
	test("reads a simulator log event", () => {
		const data = JSON.stringify({
			messageType: "Info",
			timestamp: "2026-10-15 11:05:43.082243-0700",
			processImagePath:
				"/Library/Developer/PrivateFrameworks/CoreSimulator.framework/Versions/A/Resources/Platforms/iphoneos/usr/libexec/CoreSimulatorBridge",
			eventMessage:
				"-[AXPTranslator_iOS systemAppElement]: setting _systemAppElement",
		});

		expect(parseIosEvent(data, "1")).toEqual({
			id: "1",
			time: "11:05:43.082",
			process: "CoreSimulatorBridge",
			level: "info",
			message:
				"-[AXPTranslator_iOS systemAppElement]: setting _systemAppElement",
		});
	});

	test("skips an event that is not JSON", () => {
		expect(parseIosEvent(": keep-alive", "1")).toBe(null);
	});

	test("skips an event with no message", () => {
		expect(parseIosEvent(JSON.stringify({ messageType: "Info" }), "1")).toBe(
			null,
		);
	});
});

describe("parseAndroidLine", () => {
	test("reads a logcat line", () => {
		expect(
			parseAndroidLine(
				"10-15 11:06:00.768   572 13488 D ActivityManager: sync unfroze 3317 com.google.android.googlequicksearchbox:search for 6",
				"1",
			),
		).toEqual({
			id: "1",
			time: "11:06:00.768",
			process: "ActivityManager",
			level: "debug",
			message:
				"sync unfroze 3317 com.google.android.googlequicksearchbox:search for 6",
		});
	});

	test("keeps a line it cannot parse as the message", () => {
		expect(parseAndroidLine("--------- beginning of system", "1")).toEqual({
			id: "1",
			time: "",
			process: "",
			level: "default",
			message: "--------- beginning of system",
		});
	});
});
