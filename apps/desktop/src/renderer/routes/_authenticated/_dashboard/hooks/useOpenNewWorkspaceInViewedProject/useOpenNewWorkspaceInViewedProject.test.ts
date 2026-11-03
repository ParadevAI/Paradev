import { expect, test } from "bun:test";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { cloudRepoProjectId } from "renderer/lib/github/cloudRepoProjectId";
import { resolveViewedWorkspaceHandoff } from "./useOpenNewWorkspaceInViewedProject";

const repositories = new Map([["cloud-ws", "thinkfiveable/hours"]]);
const isCloudWorkspace = (id: string) => id === "cloud-ws";

test("a cloud workspace pins Cloud and hands off its repository, not its sandbox's ids", () => {
	expect(
		resolveViewedWorkspaceHandoff({
			workspaceId: "cloud-ws",
			viewed: { projectId: "sandbox-only", hostId: "cloud-ws" },
			isCloudWorkspace,
			primaryRepositoryById: repositories,
		}),
	).toEqual({
		projectId: cloudRepoProjectId("thinkfiveable/hours"),
		hostId: CLOUD_HOST_ID,
		repository: "thinkfiveable/hours",
	});
});

test("a cloud workspace whose repository hasn't loaded pins Cloud only", () => {
	expect(
		resolveViewedWorkspaceHandoff({
			workspaceId: "cloud-ws",
			viewed: { projectId: "sandbox-only", hostId: "cloud-ws" },
			isCloudWorkspace,
			primaryRepositoryById: new Map(),
		}),
	).toEqual({ hostId: CLOUD_HOST_ID });
});

test("a cloud workspace's secondary repository row is recognised by its host", () => {
	expect(
		resolveViewedWorkspaceHandoff({
			workspaceId: "cloud-ws-api",
			viewed: { projectId: "sandbox-api", hostId: "cloud-ws" },
			isCloudWorkspace,
			primaryRepositoryById: repositories,
		}).hostId,
	).toBe(CLOUD_HOST_ID);
});

test("a host workspace pins its host and project", () => {
	expect(
		resolveViewedWorkspaceHandoff({
			workspaceId: "local-ws",
			viewed: { projectId: "device-hours", hostId: "mac" },
			isCloudWorkspace,
			primaryRepositoryById: repositories,
		}),
	).toEqual({ projectId: "device-hours", hostId: "mac" });
});

test("no viewed workspace hands off nothing", () => {
	expect(
		resolveViewedWorkspaceHandoff({
			workspaceId: null,
			viewed: undefined,
			isCloudWorkspace,
			primaryRepositoryById: repositories,
		}),
	).toEqual({});
});
