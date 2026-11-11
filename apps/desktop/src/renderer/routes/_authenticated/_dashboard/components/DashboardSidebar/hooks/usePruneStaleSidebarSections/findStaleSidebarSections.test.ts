import { describe, expect, it } from "bun:test";
import { SESSIONS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import {
	advanceStaleSectionTracker,
	findStaleSidebarSections,
	type PruneHostStatus,
	type PruneReadinessInput,
	resolvePrunableScopes,
	STALE_SECTION_CONFIRM_MS,
	STALE_SECTION_MIN_AGE_MS,
	type StaleSectionCandidateInput,
} from "./findStaleSidebarSections";

const PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const OLD = new Date(NOW - 24 * 60 * 60_000);

function section(
	tag: string | null | undefined,
	overrides: Partial<StaleSectionCandidateInput> = {},
): StaleSectionCandidateInput {
	return {
		sectionId: `${overrides.projectId ?? PROJECT}:${tag ?? "legacy"}`,
		projectId: PROJECT,
		tag,
		createdAt: OLD,
		...overrides,
	};
}

const allScopes = { now: NOW, isScopePrunable: () => true };

function ids(sections: readonly StaleSectionCandidateInput[]): string[] {
	return sections.map((item) => item.sectionId);
}

describe("findStaleSidebarSections", () => {
	it("returns a stored row whose tag no active workspace carries", () => {
		const result = findStaleSidebarSections(
			[section("gone"), section("live")],
			[{ projectId: PROJECT, tags: ["live"] }],
			[],
			allScopes,
		);
		expect(ids(result)).toEqual([`${PROJECT}:gone`]);
	});

	it("keeps a row while any workspace carries the tag (hidden ones are in the host list too)", () => {
		const result = findStaleSidebarSections(
			[section("perf work")],
			[{ projectId: PROJECT, tags: ["  Perf Work "] }],
			[],
			allScopes,
		);
		expect(result).toEqual([]);
	});

	it("matches the tag per project scope, not globally", () => {
		const result = findStaleSidebarSections(
			[section("shared")],
			[{ projectId: OTHER_PROJECT, tags: ["shared"] }],
			[],
			allScopes,
		);
		expect(ids(result)).toEqual([`${PROJECT}:shared`]);
	});

	it("keeps a folder that has a host tag_folder_settings row", () => {
		const result = findStaleSidebarSections(
			[section("made on purpose"), section("cache only")],
			[],
			[{ projectId: PROJECT, tag: "Made On Purpose" }],
			allScopes,
		);
		expect(ids(result)).toEqual([`${PROJECT}:cache only`]);
	});

	it("a settings row of another scope does not keep the folder", () => {
		const result = findStaleSidebarSections(
			[section("x")],
			[],
			[{ projectId: OTHER_PROJECT, tag: "x" }],
			allScopes,
		);
		expect(ids(result)).toEqual([`${PROJECT}:x`]);
	});

	it("never returns legacy (tag-less) rows", () => {
		const result = findStaleSidebarSections(
			[section(null), section(undefined, { sectionId: "legacy-2" })],
			[],
			[],
			allScopes,
		);
		expect(result).toEqual([]);
	});

	it("skips scopes that are not prunable", () => {
		const result = findStaleSidebarSections(
			[section("a"), section("b", { projectId: OTHER_PROJECT })],
			[],
			[],
			{ now: NOW, isScopePrunable: (scope) => scope === OTHER_PROJECT },
		);
		expect(ids(result)).toEqual([`${OTHER_PROJECT}:b`]);
	});

	it("leaves rows younger than the minimum age alone", () => {
		const fresh = section("new group", {
			createdAt: new Date(NOW - STALE_SECTION_MIN_AGE_MS + 1),
		});
		const aged = section("old group", {
			createdAt: new Date(NOW - STALE_SECTION_MIN_AGE_MS),
		});
		const result = findStaleSidebarSections([fresh, aged], [], [], allScopes);
		expect(ids(result)).toEqual([`${PROJECT}:old group`]);
	});

	it("accepts persisted string/number dates and treats unreadable ones as old", () => {
		const result = findStaleSidebarSections(
			[
				section("iso", { createdAt: new Date(NOW - 1000).toISOString() }),
				section("epoch", { createdAt: NOW - 1000 }),
				section("garbage", { createdAt: "not a date" }),
			],
			[],
			[],
			allScopes,
		);
		expect(ids(result)).toEqual([`${PROJECT}:garbage`]);
	});

	it("prunes Sessions-scope rows against project-less workspaces", () => {
		const result = findStaleSidebarSections(
			[
				section("kept", { projectId: SESSIONS_TAG_SCOPE }),
				section("gone", { projectId: SESSIONS_TAG_SCOPE }),
			],
			[
				{ projectId: null, tags: ["kept"] },
				// A project workspace with the same tag is not a session member.
				{ projectId: PROJECT, tags: ["gone"] },
			],
			[],
			allScopes,
		);
		expect(ids(result)).toEqual([`${SESSIONS_TAG_SCOPE}:gone`]);
	});

	it("treats the bare sparkle tag like any other cache row", () => {
		const result = findStaleSidebarSections([section("✨")], [], [], allScopes);
		expect(ids(result)).toEqual([`${PROJECT}:✨`]);
	});

	it("tolerates workspaces without a tags field (older hosts)", () => {
		const result = findStaleSidebarSections(
			[section("a")],
			[{ projectId: PROJECT }, { projectId: PROJECT, tags: null }],
			[],
			allScopes,
		);
		expect(ids(result)).toEqual([`${PROJECT}:a`]);
	});
});

const LOCAL = "machine-local";
const REMOTE = "machine-remote";

function statuses(
	entries: Record<string, PruneHostStatus>,
): Map<string, PruneHostStatus> {
	return new Map(Object.entries(entries));
}

function readiness(
	overrides: Partial<PruneReadinessInput> = {},
): PruneReadinessInput {
	return {
		sectionsReady: true,
		workspacesReady: true,
		workspaceHostStatuses: statuses({ [LOCAL]: "live" }),
		tagFoldersReady: true,
		tagFolderHostStatuses: statuses({ [LOCAL]: "live" }),
		projectsReady: true,
		projectHostStatuses: statuses({ [LOCAL]: "live" }),
		projectHostIds: new Map([[PROJECT, [LOCAL]]]),
		...overrides,
	};
}

describe("resolvePrunableScopes", () => {
	it("allows a local project and sessions when everything answered live", () => {
		const predicate = resolvePrunableScopes(readiness());
		expect(predicate?.(PROJECT)).toBe(true);
		expect(predicate?.(SESSIONS_TAG_SCOPE)).toBe(true);
	});

	it("never prunes an unknown project", () => {
		expect(resolvePrunableScopes(readiness())?.(OTHER_PROJECT)).toBe(false);
	});

	for (const flag of [
		"sectionsReady",
		"workspacesReady",
		"tagFoldersReady",
		"projectsReady",
	] as const) {
		it(`does nothing while ${flag} is false`, () => {
			expect(resolvePrunableScopes(readiness({ [flag]: false }))).toBeNull();
		});
	}

	for (const status of ["pending", "error"] as const) {
		it(`does nothing while any reachable host's workspace list is ${status}`, () => {
			expect(
				resolvePrunableScopes(
					readiness({
						workspaceHostStatuses: statuses({
							[LOCAL]: "live",
							[REMOTE]: status,
						}),
					}),
				),
			).toBeNull();
		});

		it(`does nothing while any host's folder settings read is ${status}`, () => {
			expect(
				resolvePrunableScopes(
					readiness({ tagFolderHostStatuses: statuses({ [LOCAL]: status }) }),
				),
			).toBeNull();
		});

		it(`does nothing while any host's project list is ${status}`, () => {
			expect(
				resolvePrunableScopes(
					readiness({ projectHostStatuses: statuses({ [LOCAL]: status }) }),
				),
			).toBeNull();
		});
	}

	it("does nothing when no host answered live at all", () => {
		expect(
			resolvePrunableScopes(
				readiness({ workspaceHostStatuses: statuses({ [LOCAL]: "offline" }) }),
			),
		).toBeNull();
	});

	it("blocks a project served by an offline host but not other projects", () => {
		const predicate = resolvePrunableScopes(
			readiness({
				workspaceHostStatuses: statuses({
					[LOCAL]: "live",
					[REMOTE]: "offline",
				}),
				tagFolderHostStatuses: statuses({
					[LOCAL]: "live",
					[REMOTE]: "offline",
				}),
				projectHostStatuses: statuses({
					[LOCAL]: "live",
					[REMOTE]: "offline",
				}),
				projectHostIds: new Map([
					[PROJECT, [LOCAL]],
					[OTHER_PROJECT, [LOCAL, REMOTE]],
				]),
			}),
		);
		expect(predicate?.(PROJECT)).toBe(true);
		expect(predicate?.(OTHER_PROJECT)).toBe(false);
	});

	it("allows a multi-host project only when every serving host is live", () => {
		const predicate = resolvePrunableScopes(
			readiness({
				workspaceHostStatuses: statuses({ [LOCAL]: "live", [REMOTE]: "live" }),
				tagFolderHostStatuses: statuses({ [LOCAL]: "live", [REMOTE]: "live" }),
				projectHostStatuses: statuses({ [LOCAL]: "live", [REMOTE]: "live" }),
				projectHostIds: new Map([[PROJECT, [LOCAL, REMOTE]]]),
			}),
		);
		expect(predicate?.(PROJECT)).toBe(true);
	});

	it("blocks a project whose host has no folder-settings result", () => {
		const predicate = resolvePrunableScopes(
			readiness({
				workspaceHostStatuses: statuses({ [LOCAL]: "live", [REMOTE]: "live" }),
				projectHostStatuses: statuses({ [LOCAL]: "live", [REMOTE]: "live" }),
				projectHostIds: new Map([[PROJECT, [LOCAL, REMOTE]]]),
			}),
		);
		expect(predicate?.(PROJECT)).toBe(false);
	});
});

describe("advanceStaleSectionTracker", () => {
	it("records a first sighting without deleting", () => {
		const { next, toDelete } = advanceStaleSectionTracker(
			new Map(),
			["a"],
			NOW,
		);
		expect(toDelete).toEqual([]);
		expect(next.get("a")).toBe(NOW);
	});

	it("deletes only after the confirmation window on a later pass", () => {
		const first = advanceStaleSectionTracker(new Map(), ["a"], NOW);
		const early = advanceStaleSectionTracker(
			first.next,
			["a"],
			NOW + STALE_SECTION_CONFIRM_MS - 1,
		);
		expect(early.toDelete).toEqual([]);
		const late = advanceStaleSectionTracker(
			early.next,
			["a"],
			NOW + STALE_SECTION_CONFIRM_MS,
		);
		expect(late.toDelete).toEqual(["a"]);
		expect(late.next.has("a")).toBe(false);
	});

	it("restarts the clock when a section stops being a candidate", () => {
		const first = advanceStaleSectionTracker(new Map(), ["a"], NOW);
		const gap = advanceStaleSectionTracker(first.next, [], NOW + 1000);
		expect(gap.next.size).toBe(0);
		const again = advanceStaleSectionTracker(
			gap.next,
			["a"],
			NOW + STALE_SECTION_CONFIRM_MS * 2,
		);
		expect(again.toDelete).toEqual([]);
	});
});
