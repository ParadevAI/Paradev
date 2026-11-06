import { describe, expect, mock, test } from "bun:test";
import {
	decideCloudWorkspaceAccess,
	type HostAsSeenByCreator,
} from "./cloud-workspace-access";

const box = { workspaceId: "ws-1", organizationId: "org-1", userId: "user-1" };
const hostId = "org-1:machine-1";

const finding = (host: HostAsSeenByCreator | null) => mock(async () => host);

describe("decideCloudWorkspaceAccess", () => {
	test("lets the creator's box into a host they own and opened", async () => {
		const findHost = finding({ role: "owner", allowCloudWorkspaces: true });

		expect(await decideCloudWorkspaceAccess(box, hostId, findHost)).toEqual({
			allowed: true,
			userId: "user-1",
			workspaceId: "ws-1",
		});
		expect(findHost).toHaveBeenCalledWith({
			userId: "user-1",
			organizationId: "org-1",
			machineId: "machine-1",
		});
	});

	test("refuses a host its owner has not opened", async () => {
		expect(
			await decideCloudWorkspaceAccess(
				box,
				hostId,
				finding({ role: "owner", allowCloudWorkspaces: false }),
			),
		).toEqual({ allowed: false, reason: "host_closed" });
	});

	test("refuses a host the creator is only a member of, even when it is open", async () => {
		expect(
			await decideCloudWorkspaceAccess(
				box,
				hostId,
				finding({ role: "member", allowCloudWorkspaces: true }),
			),
		).toEqual({ allowed: false, reason: "no_access" });
	});

	test("refuses a host the creator has no access to", async () => {
		expect(
			await decideCloudWorkspaceAccess(box, hostId, finding(null)),
		).toEqual({ allowed: false, reason: "no_access" });
	});

	test("refuses a host in another organization without looking it up", async () => {
		const findHost = finding({ role: "owner", allowCloudWorkspaces: true });

		expect(
			await decideCloudWorkspaceAccess(box, "org-2:machine-1", findHost),
		).toEqual({ allowed: false, reason: "no_access" });
		expect(findHost).not.toHaveBeenCalled();
	});

	test("refuses a caller that is not a cloud workspace", async () => {
		expect(
			await decideCloudWorkspaceAccess(
				null,
				hostId,
				finding({ role: "owner", allowCloudWorkspaces: true }),
			),
		).toEqual({ allowed: false, reason: "no_access" });
	});
});
