import { homedir } from "node:os";
import {
	type ParsedGitHubRemote,
	parseGitHubRemote,
} from "@superset/shared/github-remote";
import { BRANCH_PREFIX_MODES } from "@superset/shared/workspace-launch";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { projects, repositories, workspaces } from "../../../db/schema";
import type { TagSettingSnapshot } from "../../../events/types";
import {
	emitProjectChanged,
	getLocalProject,
	toProjectSnapshot,
	updateLocalProject,
} from "../../../projects/local-project-store";
import {
	listDeletedProjects,
	purgeDeletedProject,
	readDeletionImpact,
	restoreProject,
	softDeleteProject,
} from "../../../projects/project-deletion";
import { getLiveRepositoryAtPath } from "../../../projects/repositories";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import {
	deleteTagFolderSetting,
	getAllTagFolderSettings,
	upsertTagFolderSetting,
} from "../../../tag-folders";
import { getStrictShellEnvironment } from "../../../terminal/clean-shell-env";
import type { HostServiceContext } from "../../../types";
import { gitDetectExternalWorktreesTask } from "../../../workers/tasks/git";
import { listCheckoutsByWorkspaceId } from "../../../workspaces/checkouts";
import {
	machineOnlyProcedure,
	protectedProcedure,
	queryProcedure,
	router,
} from "../../index";
import { offLoop } from "../../off-loop";
import {
	normalizeSparseCheckoutPaths,
	serializeSparseCheckoutPaths,
} from "../workspace-creation/shared/sparse-checkout";
import { normalizeWorktreePath } from "../workspace-creation/shared/worktree-list";
import { normalizeWorktreeBaseDir } from "../workspace-creation/shared/worktree-paths";
import {
	addRepository,
	createProject,
	relocateRepository,
	removeRepository,
	setPrimaryRepository,
} from "./handlers";
import { setupProject } from "./setup-project";
import { getGitHubRemotes } from "./utils/git-remote";
import { listGitHubRepositories } from "./utils/github-repositories";
import {
	resolveLocalRepo,
	tryRevParseGitRoot,
	validateDirectoryPath,
} from "./utils/resolve-repo";

// Icons are downscaled to a small square PNG data-URI client-side; this caps
// the stored/broadcast value (it rides in project.list and project:changed).
const MAX_PROJECT_ICON_LENGTH = 256 * 1024;

// Naming instructions ride inside the naming model's system prompt; a couple
// of sentences is the intended size, so cap well below prompt-bloat territory.
const MAX_NAMING_INSTRUCTIONS_LENGTH = 2000;

/** One findByPath match: an existing v2 project this repo path could link
 * to — either the authoritative local-DB row (`local-path`) or a cloud
 * project found via a GitHub remote URL (`remote`). Module-scoped so the
 * exported router's declaration emit can name it. */
export interface FindByPathCandidate {
	id: string;
	/** The repository at the path; for a legacy cloud match, the project id. */
	repositoryId?: string;
	name: string;
	repoCloneUrl: string | null;
	source: "local-path" | "remote";
	matchesExpected: boolean;
}

const repositorySourceSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("local"),
		path: z.string().min(1),
		// `git init` a non-git folder in place first. The UI sets this only
		// after confirming intent with the user (see findByPath's needsGitInit).
		initIfNeeded: z.boolean().optional(),
	}),
	z.object({ kind: z.literal("clone"), url: z.string().min(1) }),
	z.object({ kind: z.literal("empty"), name: z.string().min(1) }),
	z.object({
		kind: z.literal("template"),
		url: z
			.string()
			.min(1)
			.refine((value) => /^https?:\/\//i.test(value), {
				message: "Template URL must be http(s)",
			}),
	}),
]);

export const projectRouter = router({
	listGitHubRepositories: machineOnlyProcedure.query(() =>
		listGitHubRepositories(),
	),

	list: protectedProcedure.query(({ ctx }) => {
		const tagSettingsByProject = new Map<string, TagSettingSnapshot[]>();
		for (const { scope, ...setting } of getAllTagFolderSettings(
			ctx.db,
			ctx.userId,
		)) {
			const settings = tagSettingsByProject.get(scope) ?? [];
			settings.push(setting);
			tagSettingsByProject.set(scope, settings);
		}
		return ctx.db
			.select()
			.from(projects)
			.where(isNull(projects.deletedAt))
			.all()
			.map((row) =>
				toProjectSnapshot(ctx.db, row, tagSettingsByProject.get(row.id) ?? []),
			);
	}),

	/** Rename. Commits locally — projects have no cloud dependency. */
	update: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				name: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) => {
			const row = updateLocalProject(
				{ db: ctx.db, eventBus: ctx.eventBus },
				input.projectId,
				{ name: input.name },
			);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return toProjectSnapshot(ctx.db, row);
		}),

	/** @deprecated Use tagFolders.upsert. Kept for mixed desktop/host versions. */
	setTagSetting: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				tag: z.string().min(1),
				displayName: z.string().min(1).max(200).nullish(),
				color: z.string().max(50).nullish(),
				tabOrder: z.number().int().nullish(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const project = getLocalProject(ctx.db, input.projectId);
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			const settings = upsertTagFolderSetting(
				{ db: ctx.db, eventBus: ctx.eventBus, userId: ctx.userId },
				input.projectId,
				input.tag,
				{
					...(input.displayName !== undefined
						? { displayName: input.displayName }
						: {}),
					...(input.color !== undefined ? { color: input.color } : {}),
					...(input.tabOrder !== undefined ? { tabOrder: input.tabOrder } : {}),
				},
			);
			if (settings === undefined) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid tag",
				});
			}
			// Old desktops only listen for project:changed.
			emitProjectChanged(ctx, "updated", project, settings);
			return { tagSettings: settings };
		}),

	/** @deprecated Use tagFolders.delete. Kept for mixed desktop/host versions. */
	deleteTagSetting: protectedProcedure
		.input(z.object({ projectId: z.string().uuid(), tag: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			const project = getLocalProject(ctx.db, input.projectId);
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			const settings = deleteTagFolderSetting(
				{ db: ctx.db, eventBus: ctx.eventBus, userId: ctx.userId },
				input.projectId,
				input.tag,
			);
			if (settings === undefined) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid tag",
				});
			}
			emitProjectChanged(ctx, "updated", project, settings);
			return { tagSettings: settings };
		}),

	get: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(({ ctx, input }) => {
			const row = getLocalProject(ctx.db, input.projectId);
			return row ? toProjectSnapshot(ctx.db, row) : null;
		}),

	addRepository: machineOnlyProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				source: repositorySourceSchema,
				parentDir: z.string().min(1).optional(),
			}),
		)
		.mutation(({ ctx, input, signal }) =>
			addRepository(ctx, { ...input, signal }),
		),

	removeRepository: machineOnlyProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				repositoryId: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) => removeRepository(ctx, input)),

	setPrimaryRepository: machineOnlyProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				repositoryId: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) => setPrimaryRepository(ctx, input)),

	relocateRepository: machineOnlyProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				repositoryId: z.string().min(1),
				path: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) => relocateRepository(ctx, input)),

	/**
	 * Set (or clear) this project's custom icon. Local-first: the icon is a
	 * small downscaled data-URI stored on the host row. The "none" sentinel
	 * means "explicitly no icon" (renderers show the letter placeholder); a
	 * null clears back to the default (GitHub owner avatar / placeholder).
	 */
	setIcon: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				icon: z
					.union([
						z
							.string()
							.max(MAX_PROJECT_ICON_LENGTH, "Icon image is too large")
							.regex(/^data:image\//, "Icon must be an image data URI"),
						z.literal("none"),
					])
					.nullable(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const row = updateLocalProject(
				{ db: ctx.db, eventBus: ctx.eventBus },
				input.projectId,
				{ icon: input.icon },
			);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return toProjectSnapshot(ctx.db, row);
		}),

	/**
	 * Set (or clear) this project's accent color. Stored as a `#rrggbb` hex on
	 * the host row; a null clears it back to the default (no accent).
	 */
	setColor: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				color: z
					.string()
					.regex(/^#[0-9a-fA-F]{6}$/, "Color must be a #rrggbb hex")
					.nullable(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const row = updateLocalProject(
				{ db: ctx.db, eventBus: ctx.eventBus },
				input.projectId,
				{ color: input.color },
			);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return toProjectSnapshot(ctx.db, row);
		}),

	setWorktreeBaseDir: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				path: z.string().nullable(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const worktreeBaseDir = normalizeWorktreeBaseDir(input.path);
			if (!getLocalProject(ctx.db, input.projectId)) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			ctx.db
				.update(projects)
				.set({ worktreeBaseDir })
				.where(eq(projects.id, input.projectId))
				.run();

			return { id: input.projectId, worktreeBaseDir };
		}),

	/**
	 * Set (or clear) this project's AI naming instructions — free text
	 * injected into workspace/branch name generation. Null or blank clears
	 * the setting so naming falls back to the default behavior.
	 */
	setNamingInstructions: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				instructions: z
					.string()
					.max(
						MAX_NAMING_INSTRUCTIONS_LENGTH,
						"Naming instructions are too long",
					)
					.nullable(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const namingInstructions = input.instructions?.trim() || null;
			const updated = ctx.db
				.update(projects)
				.set({ namingInstructions })
				.where(
					and(eq(projects.id, input.projectId), isNull(projects.deletedAt)),
				)
				.returning({ id: projects.id })
				.get();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return { namingInstructions };
		}),

	/**
	 * Set the folders new worktrees are sparse-checked-out to. An empty list
	 * clears the setting so new worktrees get a full checkout again. Existing
	 * worktrees are left as they are.
	 */
	setSparseCheckoutPaths: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				repositoryId: z.string().min(1),
				// Bounded well above the post-dedupe cap in
				// `normalizeSparseCheckoutPaths`, so a runaway payload is
				// rejected before we bother normalizing every entry.
				paths: z.array(z.string().max(1024)).max(1000),
			}),
		)
		.mutation(({ ctx, input }) => {
			const paths = normalizeSparseCheckoutPaths(input.paths);
			const updated =
				getLocalProject(ctx.db, input.projectId) &&
				ctx.db
					.update(repositories)
					.set({
						sparseCheckoutPaths: serializeSparseCheckoutPaths(paths),
						updatedAt: Date.now(),
					})
					.where(
						and(
							eq(repositories.id, input.repositoryId),
							eq(repositories.projectId, input.projectId),
						),
					)
					.returning({ id: repositories.id })
					.get();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return { sparseCheckoutPaths: paths };
		}),

	/**
	 * Set this project's branch-prefix override. A `null` mode clears the
	 * override so the project falls back to the host-wide default.
	 */
	setBranchPrefix: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				mode: z.enum(BRANCH_PREFIX_MODES).nullable(),
				customPrefix: z.string().nullable().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const updated = ctx.db
				.update(projects)
				.set({
					branchPrefixMode: input.mode,
					branchPrefixCustom: input.customPrefix ?? null,
				})
				.where(
					and(eq(projects.id, input.projectId), isNull(projects.deletedAt)),
				)
				.returning({ id: projects.id })
				.get();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Project not set up locally: ${input.projectId}`,
				});
			}
			return { success: true as const };
		}),

	findBackfillConflict: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				repoPath: z.string().min(1),
			}),
		)
		.query(() => {
			// Multiple v2 projects may point at the same GitHub URL, so a matching
			// repo URL is no longer a conflict. Kept for backwards-compatible
			// clients while older settings screens still call the endpoint.
			return { conflict: null };
		}),

	findByPath: protectedProcedure
		.input(
			z.object({
				repoPath: z.string().min(1),
				/**
				 * Opt-in to the v1→v2 importer's discovery semantics: when no
				 * local-DB row exists, walk every GitHub remote on the repo
				 * (not just origin/first) and try `expectedRemoteUrl` against
				 * cloud. In BOTH modes a local-DB hit short-circuits before
				 * any cloud call — a local row means the repo is already a v2
				 * project on this device ("local is reality"), regardless of
				 * what the cloud knows.
				 */
				walkAllRemotes: z.boolean().optional(),
				/**
				 * Hint about the remote URL the caller *thinks* this project
				 * tracks (e.g. v1's recorded githubOwner). Only consulted
				 * when `walkAllRemotes` is true.
				 */
				expectedRemoteUrl: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			// Detect "folder isn't a git repo yet" without throwing, so the import
			// UI can offer to `git init` it (create importLocal + initIfNeeded)
			// instead of dead-ending on a BAD_REQUEST. Additive optional field —
			// repo paths never carry needsGitInit, so existing callers are
			// unaffected.
			const root = await tryRevParseGitRoot(input.repoPath);
			if (root === null) {
				validateDirectoryPath(input.repoPath, "Path"); // 400 on missing / not-a-dir
				return {
					candidates: [],
					cloudErrors: [] as { url: string; message: string }[],
					needsGitInit: true as const,
				};
			}

			const resolved = await resolveLocalRepo(root);
			const gitRoot = resolved.repoPath;

			const expectedParsed =
				input.walkAllRemotes && input.expectedRemoteUrl
					? parseGitHubRemote(input.expectedRemoteUrl)
					: null;
			const expectedUrlLower = expectedParsed?.url.toLowerCase();
			const matches = (cloneUrl: string | null) =>
				!!expectedUrlLower &&
				!!cloneUrl &&
				cloneUrl.toLowerCase() === expectedUrlLower;

			const localRepository = getLiveRepositoryAtPath(ctx.db, gitRoot);
			const localProject = localRepository
				? getLocalProject(ctx.db, localRepository.projectId)
				: undefined;

			// A local-DB row keyed by this repo's git root is authoritative:
			// the repo is already a v2 project on this device ("local is
			// reality" — see the delete saga below). Return it without
			// consulting the cloud. This covers both modes: the folder-first
			// default has always worked this way, and the v1 importer must
			// too — local-first projects have no cloud row, so any cloud
			// probe here misreads them as stale and makes the importer
			// create duplicates.
			if (localProject && localRepository) {
				return {
					candidates: [
						{
							id: localProject.id,
							repositoryId: localRepository.id,
							name: localProject.name || localRepository.name,
							repoCloneUrl: localRepository.url ?? null,
							source: "local-path" as const,
							matchesExpected: matches(localRepository.url ?? null),
						},
					],
					cloudErrors: [] as { url: string; message: string }[],
				};
			}

			// Default behavior (folder-first import): purely local. No local
			// hit means the caller creates a fresh local project; the cloud
			// is never consulted.
			if (!input.walkAllRemotes) {
				return { candidates: [], cloudErrors: [] };
			}

			// walkAllRemotes branch — v1→v2 importer, no local row: discover
			// linkable cloud candidates across every GitHub remote.
			const allRemotes = await getGitHubRemotes(createUserSimpleGit(gitRoot));

			const urlsToQuery = new Map<string, ParsedGitHubRemote>();
			for (const parsed of allRemotes.values()) {
				urlsToQuery.set(parsed.url.toLowerCase(), parsed);
			}
			if (expectedParsed) {
				urlsToQuery.set(expectedParsed.url.toLowerCase(), expectedParsed);
			}

			const byId = new Map<string, FindByPathCandidate>();

			// Cloud lookup for every URL we know about. This is the last
			// consumer of the cloud v2_projects table; it dies with the v1
			// importer (the only caller that sets walkAllRemotes).
			const cloudErrors: { url: string; message: string }[] = [];
			for (const parsed of urlsToQuery.values()) {
				try {
					const { candidates } =
						await ctx.api.v2Project.findByGitHubRemote.query({
							organizationId: ctx.organizationId,
							repoCloneUrl: parsed.url,
						});
					for (const c of candidates) {
						const existing = byId.get(c.id);
						if (existing) {
							// Same project reachable via two remote URLs; keep one
							// candidate and merge the match flag.
							existing.matchesExpected =
								existing.matchesExpected || matches(parsed.url);
							existing.repoCloneUrl = existing.repoCloneUrl ?? parsed.url;
						} else {
							byId.set(c.id, {
								id: c.id,
								repositoryId: c.id,
								name: c.name,
								repoCloneUrl: parsed.url,
								source: "remote",
								matchesExpected: matches(parsed.url),
							});
						}
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					cloudErrors.push({ url: parsed.url, message });
					console.warn(
						"[project.findByPath] cloud findByGitHubRemote failed for",
						parsed.url,
						err,
					);
				}
			}

			// Sort: matchesExpected first, then alphabetic.
			const candidates = Array.from(byId.values()).sort((a, b) => {
				if (a.matchesExpected !== b.matchesExpected) {
					return a.matchesExpected ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});

			// Caller surfaces this when there are no candidates and at least
			// one cloud query failed — so users see a clear "couldn't reach
			// cloud" instead of a misleading "Import" (which would create a
			// duplicate v2 project).
			return { candidates, cloudErrors };
		}),

	create: machineOnlyProcedure
		.input(
			z.object({
				name: z.string().min(1),
				/** The first is the primary. */
				repositories: z.array(repositorySourceSchema).min(1),
				/** Where clone, empty and template repositories go. */
				parentDir: z.string().min(1).optional(),
			}),
		)
		.mutation(({ ctx, input, signal }) =>
			createProject(ctx, { ...input, signal }),
		),
	/**
	 * Add a project that lives on another host to this host, keeping its
	 * project and repository ids so every surface sees one project.
	 */
	setup: machineOnlyProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				/** The project as another host has it. Needed when this host has no row for it or lacks some of its repositories. */
				origin: z
					.object({
						name: z.string().min(1),
						primaryRepositoryId: z.string().uuid(),
						repositories: z
							.array(
								z.object({
									id: z.string().uuid(),
									name: z.string().min(1),
									url: z.string().min(1).nullable(),
								}),
							)
							.min(1),
					})
					.optional(),
				repositories: z.array(
					z.object({
						id: z.string().uuid(),
						mode: z.discriminatedUnion("kind", [
							z.object({
								kind: z.literal("clone"),
								parentDir: z.string().min(1),
								allowRelocate: z.boolean().optional(),
							}),
							z.object({
								kind: z.literal("import"),
								path: z.string().min(1),
								allowRelocate: z.boolean().optional(),
							}),
						]),
					}),
				),
			}),
		)
		.mutation(({ ctx, input, signal }) =>
			setupProject(ctx, { ...input, signal }),
		),

	/**
	 * Soft delete: the project and its live workspaces disappear for
	 * everyone on this device, teardown runs and terminals stop, and the
	 * worktrees stay on disk so `restore` can undo it until the purge sweep
	 * runs. The repository folder is never removed.
	 */
	remove: machineOnlyProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await softDeleteProject(ctx, input.projectId);
			return { success: true };
		}),

	restore: machineOnlyProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.mutation(({ ctx, input }) => {
			const restored = restoreProject(ctx, input.projectId);
			if (!restored) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			return restored;
		}),

	purge: machineOnlyProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			if (!(await purgeDeletedProject(ctx, input.projectId))) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Only a deleted project can be deleted permanently",
				});
			}
			return { success: true };
		}),

	listDeleted: protectedProcedure.query(({ ctx }) => listDeletedProjects(ctx)),

	/** Git worktrees that other agent tools (Conductor, T3 Code, Orca, …) left on
	 * this machine and no workspace tracks yet, grouped by repository. */
	detectExternalWorktrees: queryProcedure.query(async (args) => ({
		repos: await offLoop({
			task: gitDetectExternalWorktreesTask,
			prepare: async ({ ctx }) => ({
				homeDir: homedir(),
				trackedWorktreePaths: trackedCheckoutPaths(
					ctx.db,
					ctx.db
						.select({
							id: workspaces.id,
							worktreePath: workspaces.worktreePath,
						})
						.from(workspaces)
						.leftJoin(projects, eq(projects.id, workspaces.projectId))
						.where(
							or(isNull(workspaces.archivedAt), isNotNull(projects.deletedAt)),
						)
						.all(),
				),
				gitEnv: await getStrictShellEnvironment().catch(
					() => process.env as Record<string, string>,
				),
			}),
			options: () => ({ timeoutMs: 4_000 }),
		})(args),
	})),

	deletionImpact: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(({ ctx, input }) => readDeletionImpact(ctx, input.projectId)),
});

function trackedCheckoutPaths(
	db: HostServiceContext["db"],
	rows: { id: string; worktreePath: string }[],
): string[] {
	const byWorkspace = listCheckoutsByWorkspaceId(db, rows);
	return rows.flatMap((row) => [
		normalizeWorktreePath(row.worktreePath),
		...(byWorkspace.get(row.id) ?? []).map((c) =>
			normalizeWorktreePath(c.path),
		),
	]);
}
