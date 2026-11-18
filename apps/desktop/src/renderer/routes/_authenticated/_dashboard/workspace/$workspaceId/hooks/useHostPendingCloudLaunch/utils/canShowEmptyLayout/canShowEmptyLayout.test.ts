import { expect, test } from "bun:test";
import { canShowEmptyLayout } from "./canShowEmptyLayout";

test("a sandbox workspace waits for its first pending-launch answer", () => {
	expect(
		canShowEmptyLayout({
			isLayoutReady: true,
			isSandboxHost: true,
			pendingLaunchStatus: "pending",
		}),
	).toBe(false);
	for (const settled of ["success", "error"] as const) {
		expect(
			canShowEmptyLayout({
				isLayoutReady: true,
				isSandboxHost: true,
				pendingLaunchStatus: settled,
			}),
		).toBe(true);
	}
});

test("a non-sandbox host never waits on the pending launch", () => {
	expect(
		canShowEmptyLayout({
			isLayoutReady: true,
			isSandboxHost: false,
			pendingLaunchStatus: "pending",
		}),
	).toBe(true);
});

test("a layout that is not ready is not known to be empty", () => {
	expect(
		canShowEmptyLayout({
			isLayoutReady: false,
			isSandboxHost: false,
			pendingLaunchStatus: "success",
		}),
	).toBe(false);
});
