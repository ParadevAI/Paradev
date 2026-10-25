import { describe, expect, test } from "bun:test";
import {
	readPendingLaunchReport,
	withoutPendingLaunchReport,
	withPendingLaunchReport,
} from "./launchMarker";

const claim = "claude 2026-05-01T00:00:00.000Z\n";
const report = {
	kind: "chat" as const,
	sessionId: "22222222-2222-4222-8222-222222222222",
	terminalId: "term-1",
	automationRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

describe("launch marker recovery", () => {
	test("keeps a pending report beside the claim so a restart does not relaunch", () => {
		const marker = withPendingLaunchReport(claim, report);
		expect(readPendingLaunchReport(marker)).toEqual(report);
		expect(marker.startsWith("claude ")).toBe(true);
		const cleared = withoutPendingLaunchReport(marker);
		expect(readPendingLaunchReport(cleared)).toBeNull();
		expect(cleared.startsWith("claude ")).toBe(true);
	});

	test("ignores a claim with no pending report", () => {
		expect(readPendingLaunchReport(claim)).toBeNull();
		expect(readPendingLaunchReport("pending-report not-json\n")).toBeNull();
	});
});
