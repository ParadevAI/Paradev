import { describe, expect, mock, test } from "bun:test";
import type { HostAsSeenByCreator } from "../host/cloud-workspace-access";
import { assertSandboxTargetAccess } from "./sandboxTargetAccess";

const box = { workspaceId: "ws-1", organizationId: "org-1", userId: "user-1" };

describe("assertSandboxTargetAccess", () => {
	test("keeps signed-in client behavior unchanged", async () => {
		const findHost = mock(async () => null);
		await assertSandboxTargetAccess(null, "machine-1", findHost);
		expect(findHost).not.toHaveBeenCalled();
	});

	test("allows a cloud target without a host lookup", async () => {
		const findHost = mock(async () => null);
		await assertSandboxTargetAccess(box, "cloud", findHost);
		expect(findHost).not.toHaveBeenCalled();
	});

	test("allows a host the creator owns and opened to cloud workspaces", async () => {
		const findHost = mock(async () => ({
			role: "owner",
			allowCloudWorkspaces: true,
		}));
		await assertSandboxTargetAccess(box, "machine-1", findHost);
		expect(findHost).toHaveBeenCalledWith({
			userId: box.userId,
			organizationId: box.organizationId,
			machineId: "machine-1",
		});
	});

	test.each([
		["closed host", { role: "owner", allowCloudWorkspaces: false }],
		["member's host", { role: "member", allowCloudWorkspaces: true }],
		["inaccessible host", null],
	] satisfies [
		string,
		HostAsSeenByCreator | null,
	][])("refuses a %s", async (_name, host) => {
		await expect(
			assertSandboxTargetAccess(box, "machine-1", async () => host),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("refuses automatic host selection that could pick an inaccessible host", async () => {
		const findHost = mock(async () => null);
		await expect(
			assertSandboxTargetAccess(box, null, findHost),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(findHost).not.toHaveBeenCalled();
	});
});
