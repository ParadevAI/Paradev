import { expect, test } from "bun:test";
import type { WorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { canShowEmptyLayout } from "./canShowEmptyLayout";

const sandbox: WorkspaceHostTarget = {
	status: "ready",
	kind: "sandbox",
	url: "http://box",
} as WorkspaceHostTarget;

function decide(
	hostTarget: WorkspaceHostTarget,
	pendingLaunchStatus: "pending" | "success" | "error" = "pending",
	isLayoutReady = true,
) {
	return canShowEmptyLayout({ isLayoutReady, hostTarget, pendingLaunchStatus });
}

test("an unresolved host target waits: it may still turn out to be a sandbox", () => {
	expect(decide({ status: "loading" })).toBe(false);
});

test("a sandbox waits for its first pending-launch answer", () => {
	expect(decide(sandbox, "pending")).toBe(false);
	expect(decide(sandbox, "success")).toBe(true);
	expect(decide(sandbox, "error")).toBe(true);
});

test("hosts that never have a box launch do not wait", () => {
	for (const target of [
		{ status: "not-found" },
		{ status: "local-starting", hostId: "host" },
		{ status: "ready", kind: "local", url: "http://local" },
		{ status: "ready", kind: "remote", url: "http://remote" },
	] as WorkspaceHostTarget[]) {
		expect(decide(target, "pending")).toBe(true);
	}
});

test("a layout that is not ready is not known to be empty", () => {
	expect(
		decide(
			{ status: "ready", kind: "local", url: "x" } as WorkspaceHostTarget,
			"success",
			false,
		),
	).toBe(false);
});
