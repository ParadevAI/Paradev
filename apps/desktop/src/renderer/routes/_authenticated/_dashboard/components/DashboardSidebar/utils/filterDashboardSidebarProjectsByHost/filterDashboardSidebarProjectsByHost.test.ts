import { describe, expect, it } from "bun:test";
import {
	makeProject,
	makeSection,
	makeWorkspace,
} from "../testProjectFixtures";
import { filterDashboardSidebarProjectsByHost } from "./filterDashboardSidebarProjectsByHost";

const local = makeWorkspace({ id: "w-local", name: "fix-login" });
const remote = makeWorkspace({
	id: "w-remote",
	name: "on-laptop",
	hostType: "remote-device",
});
const cloud = makeWorkspace({
	id: "w-cloud",
	name: "sandbox",
	hostType: "cloud",
});
const section = makeSection({
	id: "s1",
	name: "Backend",
	workspaces: [remote, cloud],
});
const projects = [
	makeProject({
		id: "p-mixed",
		name: "Mixed",
		children: [
			{ type: "workspace", workspace: local },
			{ type: "section", section },
		],
	}),
	makeProject({
		id: "p-local-only",
		name: "Local only",
		children: [{ type: "workspace", workspace: local }],
	}),
];

describe("filterDashboardSidebarProjectsByHost", () => {
	it("returns the same array for 'all'", () => {
		expect(filterDashboardSidebarProjectsByHost(projects, "all")).toBe(
			projects,
		);
	});

	it("'local' keeps devices, drops sandboxes, and keeps untouched projects by reference", () => {
		const [mixed, localOnly] = filterDashboardSidebarProjectsByHost(
			projects,
			"local",
		);
		expect(mixed?.children).toEqual([
			{ type: "workspace", workspace: local },
			{ type: "section", section: { ...section, workspaces: [remote] } },
		]);
		expect(localOnly).toBe(projects[1]);
	});

	it("'cloud' keeps sandboxes and drops projects left with nothing", () => {
		const result = filterDashboardSidebarProjectsByHost(projects, "cloud");
		expect(result.map((project) => project.id)).toEqual(["p-mixed"]);
		expect(result[0]?.children).toEqual([
			{ type: "section", section: { ...section, workspaces: [cloud] } },
		]);
	});
});
