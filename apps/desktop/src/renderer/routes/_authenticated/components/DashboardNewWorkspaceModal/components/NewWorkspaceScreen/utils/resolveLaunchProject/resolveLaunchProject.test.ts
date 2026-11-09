import { expect, test } from "bun:test";
import {
	type LaunchProject,
	type LaunchProjectPick,
	resolveLaunchProject,
} from "./resolveLaunchProject";

const deviceHours = { id: "device-hours", repository: "thinkfiveable/hours" };
const deviceSite = { id: "device-site", repository: "thinkfiveable/site" };
const cloudHours = { id: "cloud-hours", repository: "thinkfiveable/hours" };
const cloudApi = { id: "cloud-api", repository: "thinkfiveable/api" };
const known = [deviceHours, deviceSite, cloudHours, cloudApi];

function resolve(
	pick: LaunchProjectPick,
	projects: LaunchProject[],
	{
		isReady = true,
		lastChoice = null,
	}: {
		isReady?: boolean;
		lastChoice?: Parameters<typeof resolveLaunchProject>[0]["lastChoice"];
	} = {},
) {
	return resolveLaunchProject({
		pick,
		projects,
		knownProjects: known,
		isReady,
		lastChoice,
	});
}

test("keeps a pick that exists on the host", () => {
	expect(
		resolve({ kind: "project", projectId: "cloud-api" }, [
			cloudHours,
			cloudApi,
		]),
	).toEqual({ projectId: "cloud-api", isSession: false, isPending: false });
});

test("a pick follows its repository to another host", () => {
	expect(
		resolve({ kind: "project", projectId: "device-hours" }, [
			cloudHours,
			cloudApi,
		]),
	).toEqual({ projectId: "cloud-hours", isSession: false, isPending: false });
});

test("a pick carries its repository to a host whose list doesn't know it", () => {
	expect(
		resolveLaunchProject({
			pick: {
				kind: "project",
				projectId: "cloud-stand-in",
				repository: "thinkfiveable/hours",
			},
			projects: [deviceHours, deviceSite],
			knownProjects: [deviceHours, deviceSite],
			isReady: true,
			lastChoice: null,
		}),
	).toEqual({ projectId: "device-hours", isSession: false, isPending: false });
});

test("a pick with no counterpart falls back to the host's last choice", () => {
	expect(
		resolve(
			{ kind: "project", projectId: "device-site" },
			[cloudHours, cloudApi],
			{
				lastChoice: { kind: "project", projectId: "cloud-api" },
			},
		),
	).toEqual({ projectId: "cloud-api", isSession: false, isPending: false });
});

test("a pick whose repository isn't on the host falls back", () => {
	expect(
		resolve(
			{
				kind: "project",
				projectId: "elsewhere",
				repository: "thinkfiveable/site",
			},
			[cloudHours, cloudApi],
			{ lastChoice: { kind: "project", projectId: "cloud-hours" } },
		),
	).toEqual({ projectId: "cloud-hours", isSession: false, isPending: false });
});

test("holds a pick no list knows yet, even once the list has loaded", () => {
	expect(
		resolve({ kind: "project", projectId: "just-added" }, [deviceHours], {
			lastChoice: { kind: "project", projectId: "device-hours" },
		}),
	).toEqual({ projectId: "just-added", isSession: false, isPending: true });
});

test("a known project without a repository falls back on the cloud", () => {
	const scratch = { id: "scratch", repository: null };
	expect(
		resolveLaunchProject({
			pick: { kind: "project", projectId: "scratch" },
			projects: [cloudHours],
			knownProjects: [...known, scratch],
			isReady: true,
			lastChoice: { kind: "project", projectId: "cloud-hours" },
		}),
	).toEqual({ projectId: "cloud-hours", isSession: false, isPending: false });
});

test("holds a pick while the host's list is still loading", () => {
	expect(
		resolve({ kind: "project", projectId: "just-added" }, [deviceHours], {
			isReady: false,
			lastChoice: { kind: "project", projectId: "device-hours" },
		}),
	).toEqual({ projectId: "just-added", isSession: false, isPending: true });
});

test("restores a remembered No project choice", () => {
	expect(
		resolve({ kind: "none" }, [cloudHours], { lastChoice: { kind: "none" } }),
	).toEqual({ projectId: null, isSession: true, isPending: false });
});

test("a session pick stays a session on any host", () => {
	expect(resolve({ kind: "session" }, [cloudHours])).toEqual({
		projectId: null,
		isSession: true,
		isPending: false,
	});
});

test("selects the only project when nothing else decides", () => {
	expect(resolve({ kind: "none" }, [cloudHours])).toEqual({
		projectId: "cloud-hours",
		isSession: false,
		isPending: false,
	});
});

test("doesn't auto-select a lone project while other hosts are still loading", () => {
	expect(resolve({ kind: "none" }, [cloudHours], { isReady: false })).toEqual({
		projectId: null,
		isSession: false,
		isPending: true,
	});
});

test("leaves the choice open rather than guessing among several", () => {
	expect(resolve({ kind: "none" }, [cloudHours, cloudApi])).toEqual({
		projectId: null,
		isSession: false,
		isPending: false,
	});
});
