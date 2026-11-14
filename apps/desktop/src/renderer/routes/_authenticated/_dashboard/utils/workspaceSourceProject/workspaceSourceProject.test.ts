import { expect, test } from "bun:test";
import {
	type HostProjectRow,
	type HostRepository,
	mergeHostProjects,
} from "renderer/hooks/host-projects/useHostProjects/useHostProjects.utils";
import { checkoutRepositoryFullNames } from "../repositorySet";
import { workspaceSourceProject } from "./workspaceSourceProject";

const repository = (id: string): HostRepository => ({
	id,
	projectId: "project",
	isPrimary: id === "web",
	name: id,
	path: `/repos/${id}`,
	provider: "github",
	owner: "acme",
	repoName: id,
	url: null,
	remoteName: null,
	sparseCheckoutPaths: [],
	pathState: "ok",
});

const row = (repositories: HostRepository[]): HostProjectRow => ({
	id: "project",
	name: "Project",
	primaryRepositoryId: "web",
	repositories,
	worktreeBaseDir: null,
	icon: null,
	color: null,
	createdAt: 1,
	updatedAt: 1,
});

const hostResults = [
	{
		target: {
			machineId: "local",
			organizationId: "org",
			hostUrl: "http://127.0.0.1",
			isLocal: true,
		},
		rows: [row([repository("web")])],
		reachable: true,
	},
	{
		target: {
			machineId: "remote",
			organizationId: "org",
			hostUrl: null,
			isLocal: false,
		},
		rows: [row([repository("api"), repository("web")])],
		reachable: true,
	},
];
const projects = mergeHostProjects({ hostResults });

test("a remote workspace reads the repositories of its own host", () => {
	const project = workspaceSourceProject({
		hostResults,
		projects,
		hostId: "remote",
		projectId: "project",
	});
	expect(
		checkoutRepositoryFullNames(
			[{ repositoryId: "api" }, { repositoryId: "web" }],
			project?.repositories ?? [],
		),
	).toEqual(["acme/api", "acme/web"]);
});

test("a workspace no host lists falls back to the merged project", () => {
	expect(
		workspaceSourceProject({
			hostResults,
			projects,
			hostId: "cloud-box",
			projectId: "project",
		})?.repositories.map((r) => r.id),
	).toEqual(["web"]);
	expect(
		workspaceSourceProject({
			hostResults,
			projects,
			hostId: "remote",
			projectId: null,
		}),
	).toBeUndefined();
});
