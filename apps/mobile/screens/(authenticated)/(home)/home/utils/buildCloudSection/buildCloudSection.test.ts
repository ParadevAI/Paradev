import { describe, expect, test } from "bun:test";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import type { HomeListItem } from "../../types";
import {
	buildCloudSection,
	type CloudRepos,
	cloudRepoName,
} from "./buildCloudSection";

const row = (
	id: string,
	{
		created = 0,
		activity = null,
		tags = [],
	}: { created?: number; activity?: number | null; tags?: string[] } = {},
): CloudWorkspaceRow =>
	({
		id,
		name: id,
		branch: id,
		tags,
		createdAt: new Date(created),
		agentStatusAt: activity === null ? null : new Date(activity),
		deletedAt: null,
	}) as unknown as CloudWorkspaceRow;

const answered = (byWorkspace: Record<string, string>): CloudRepos => ({
	status: "success",
	byWorkspace: new Map(
		Object.entries(byWorkspace).map(([workspaceId, fullName]) => [
			workspaceId,
			{ id: `repo:${fullName}`, fullName },
		]),
	),
});

const options = {
	sort: "active" as const,
	archived: false,
	rowAttention: () => null,
	isCollapsed: () => false,
	noProjectName: "No project",
};

const describeItems = (items: HomeListItem[] | null) =>
	items?.map((item) => {
		switch (item.kind) {
			case "projectHeader":
				return `[${item.name} ${item.count}]`;
			case "folderHeader":
				return `{${item.folder.name}}`;
			case "cloudRow":
				return item.row.id;
			default:
				return item.kind;
		}
	}) ?? null;

describe("cloudRepoName", () => {
	test("names the repository without its owner, nothing before an answer", () => {
		expect(cloudRepoName(answered({ a: "acme/web" }), "a")).toBe("web");
		expect(cloudRepoName(answered({}), "a")).toBeNull();
		expect(cloudRepoName({ status: "pending" }, "a")).toBeNull();
	});
});

describe("buildCloudSection", () => {
	test("puts each row under its primary repository by short name, no repository last", () => {
		const items = buildCloudSection(
			[row("a"), row("b"), row("loose"), row("c")],
			answered({ a: "acme/web", b: "acme/api", c: "acme/web" }),
			options,
		);
		expect(describeItems(items)).toEqual([
			"[api 1]",
			"b",
			"[web 2]",
			"a",
			"c",
			"[No project 1]",
			"loose",
		]);
	});

	test("leaves pinned rows to the Pinned section, hiding a repository left empty", () => {
		const items = buildCloudSection(
			[row("a"), row("b"), row("c")],
			answered({ a: "acme/web", b: "acme/api", c: "acme/web" }),
			{ ...options, lifted: new Set(["b", "c"]) },
		);
		expect(describeItems(items)).toEqual(["[web 1]", "a"]);
	});

	test("waits while the repositories are pending, rather than filing rows under no repository", () => {
		expect(
			buildCloudSection([row("a")], { status: "pending" }, options),
		).toBeNull();
		expect(buildCloudSection([], { status: "pending" }, options)).toEqual([]);
	});

	test("lists rows flat, newest first, when the repositories failed", () => {
		const items = buildCloudSection(
			[row("old", { created: 1 }), row("new", { created: 2 })],
			{ status: "error" },
			options,
		);
		expect(describeItems(items)).toEqual(["new", "old"]);
	});

	test("orders rows by the sort mode: activity under active, creation otherwise", () => {
		const rows = [
			row("busy", { created: 1, activity: 50 }),
			row("fresh", { created: 10 }),
		];
		const repos = answered({ busy: "acme/web", fresh: "acme/web" });
		expect(describeItems(buildCloudSection(rows, repos, options))).toEqual([
			"[web 2]",
			"busy",
			"fresh",
		]);
		expect(
			describeItems(
				buildCloudSection(rows, repos, { ...options, sort: "created" }),
			),
		).toEqual(["[web 2]", "fresh", "busy"]);
	});

	test("groups rows by their tags under the repository", () => {
		const items = buildCloudSection(
			[
				row("tagged", { created: 2, tags: ["bugs"] }),
				row("plain", { created: 1 }),
			],
			answered({ tagged: "acme/web", plain: "acme/web" }),
			options,
		);
		expect(describeItems(items)).toEqual([
			"[web 2]",
			"{bugs}",
			"tagged",
			"plain",
		]);
	});

	test("a collapsed repository hides its rows and carries their attention", () => {
		const items = buildCloudSection([row("a")], answered({ a: "acme/web" }), {
			...options,
			isCollapsed: (_place, key) => key === "repo:acme/web",
			rowAttention: () => "review",
		});
		expect(items).toEqual([
			expect.objectContaining({
				kind: "projectHeader",
				collapsed: true,
				attention: "review",
			}),
		]);
	});
});
