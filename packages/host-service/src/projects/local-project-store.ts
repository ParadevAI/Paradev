import { and, eq, isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects } from "../db/schema";
import type { EventBus } from "../events";
import type { ProjectSnapshot, TagSettingSnapshot } from "../events/types";
import {
	getLiveRepositoryAtPath,
	getRepositoryAtPathIncludingDeleted,
	listProjectRepositories,
	toRepositorySnapshot,
} from "./repositories";

export type HostProjectRow = typeof projects.$inferSelect;

export interface ProjectStoreContext {
	db: HostDb;
	eventBus: EventBus;
}

export function toProjectSnapshot(
	db: HostDb,
	row: HostProjectRow,
	tagSettings?: TagSettingSnapshot[],
): ProjectSnapshot {
	const repositoryRows = listProjectRepositories(db, row.id);
	const primary = repositoryRows.find((r) => r.id === row.primaryRepositoryId);
	return {
		id: row.id,
		// Rows that predate local ownership have an empty name until the
		// backfill sweep fills it; the primary repository's name is the honest
		// fallback.
		name: row.name || primary?.name || row.id,
		primaryRepositoryId: row.primaryRepositoryId,
		repositories: repositoryRows.map((r) =>
			toRepositorySnapshot(r, row.primaryRepositoryId),
		),
		worktreeBaseDir: row.worktreeBaseDir,
		branchPrefixMode: row.branchPrefixMode,
		branchPrefixCustom: row.branchPrefixCustom,
		namingInstructions: row.namingInstructions,
		icon: row.icon,
		color: row.color,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt || row.createdAt,
		...(tagSettings !== undefined ? { tagSettings } : {}),
	};
}

/** A live project. Deleted projects are hidden from every caller that does
 * not ask for them by name. */
export function getLocalProject(
	db: HostDb,
	id: string,
): HostProjectRow | undefined {
	return db.query.projects
		.findFirst({ where: and(eq(projects.id, id), isNull(projects.deletedAt)) })
		.sync();
}

export function getProjectIncludingDeleted(
	db: HostDb,
	id: string,
): HostProjectRow | undefined {
	return db.query.projects.findFirst({ where: eq(projects.id, id) }).sync();
}

/** The live project with a repository at `repoPath`. */
export function getLiveProjectAtPath(
	db: HostDb,
	repoPath: string,
): HostProjectRow | undefined {
	const repository = getLiveRepositoryAtPath(db, repoPath);
	return repository ? getLocalProject(db, repository.projectId) : undefined;
}

export function getProjectAtPathIncludingDeleted(
	db: HostDb,
	repoPath: string,
): HostProjectRow | undefined {
	const repository = getRepositoryAtPathIncludingDeleted(db, repoPath);
	return repository
		? getProjectIncludingDeleted(db, repository.projectId)
		: undefined;
}

export function emitProjectChanged(
	ctx: ProjectStoreContext,
	eventType: "created" | "updated" | "deleted",
	rowOrId: HostProjectRow | string,
	tagSettings?: TagSettingSnapshot[],
): void {
	const deleted = eventType === "deleted";
	ctx.eventBus.broadcastProjectChanged({
		projectId: typeof rowOrId === "string" ? rowOrId : rowOrId.id,
		eventType,
		project:
			deleted || typeof rowOrId === "string"
				? null
				: toProjectSnapshot(ctx.db, rowOrId, tagSettings),
		occurredAt: Date.now(),
	});
}

export interface UpdateLocalProjectPatch {
	name?: string;
	icon?: string | null;
	color?: string | null;
}

/** Patch a local project row, bump `updatedAt`, and broadcast. */
export function updateLocalProject(
	ctx: ProjectStoreContext,
	id: string,
	patch: UpdateLocalProjectPatch,
): HostProjectRow | undefined {
	const existing = getLocalProject(ctx.db, id);
	if (!existing) return undefined;
	ctx.db
		.update(projects)
		.set({ ...patch, updatedAt: Date.now() })
		.where(eq(projects.id, id))
		.run();
	const row = getLocalProject(ctx.db, id);
	if (!row) return undefined;
	emitProjectChanged(ctx, "updated", row);
	return row;
}
