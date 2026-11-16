import { describe, expect, it } from "bun:test";
import { getCloudAgentAlertEvent } from "./cloudAgentAlerts";

describe("getCloudAgentAlertEvent", () => {
	it("stays silent on the first sighting of a workspace", () => {
		expect(
			getCloudAgentAlertEvent(undefined, { status: "review", at: 2 }),
		).toBeNull();
	});

	it("alerts when a working agent finishes, fails, or asks for permission", () => {
		const working = { status: "working" as const, at: 1 };
		expect(getCloudAgentAlertEvent(working, { status: "review", at: 2 })).toBe(
			"Stop",
		);
		expect(getCloudAgentAlertEvent(working, { status: "failed", at: 2 })).toBe(
			"Failed",
		);
		expect(
			getCloudAgentAlertEvent(working, { status: "permission", at: 2 }),
		).toBe("PermissionRequest");
	});

	it("stays silent when an agent starts working or the status is unchanged", () => {
		const review = { status: "review" as const, at: 1 };
		expect(
			getCloudAgentAlertEvent(review, { status: "working", at: 2 }),
		).toBeNull();
		expect(
			getCloudAgentAlertEvent(review, { status: "review", at: 1 }),
		).toBeNull();
		expect(getCloudAgentAlertEvent(review, { status: null, at: 1 })).toBeNull();
	});

	it("stays silent for a report older than the one already seen", () => {
		expect(
			getCloudAgentAlertEvent(
				{ status: "working", at: 5 },
				{ status: "review", at: 3 },
			),
		).toBeNull();
	});
});
