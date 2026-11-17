import type { db, dbWs } from "@superset/db/client";
import { taskLabelAssignments, taskLabels } from "@superset/db/schema";
import { pickEntityColor } from "@superset/shared/entity-colors";
import {
	labelAncestorNames,
	labelParentName,
	normalizeLabelName,
} from "@superset/shared/labels";
import { and, eq, inArray } from "drizzle-orm";

type Executor =
	| typeof db
	| Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/**
 * The organization's labels with these names, creating the ones it doesn't
 * have yet. A path name (`acme/web`) also creates its parents and links each
 * label to its parent; only the named labels are returned.
 */
export async function ensureLabels(
	executor: Executor,
	organizationId: string,
	names: string[],
) {
	const normalized = [
		...new Set(
			names
				.map(normalizeLabelName)
				.filter((name): name is string => name !== null),
		),
	];
	if (normalized.length === 0) return [];
	const withAncestors = [
		...new Set(
			normalized.flatMap((name) => [...labelAncestorNames(name), name]),
		),
	];
	await executor
		.insert(taskLabels)
		.values(
			withAncestors.map((name) => ({
				organizationId,
				name,
				color: pickEntityColor(),
			})),
		)
		.onConflictDoNothing();
	const rows = await executor
		.select({
			id: taskLabels.id,
			name: taskLabels.name,
			parentId: taskLabels.parentId,
		})
		.from(taskLabels)
		.where(
			and(
				eq(taskLabels.organizationId, organizationId),
				inArray(taskLabels.name, withAncestors),
			),
		);
	const idByName = new Map(rows.map((row) => [row.name, row.id]));
	for (const row of rows) {
		const parentName = labelParentName(row.name);
		const parentId = parentName ? idByName.get(parentName) : undefined;
		if (parentId && row.parentId !== parentId) {
			await executor
				.update(taskLabels)
				.set({ parentId })
				.where(eq(taskLabels.id, row.id));
		}
	}
	const requested = new Set(normalized);
	return rows
		.filter((row) => requested.has(row.name))
		.map(({ id, name }) => ({ id, name }));
}

export async function addTaskLabels(
	executor: Executor,
	taskId: string,
	labelIds: string[],
) {
	if (labelIds.length === 0) return [];
	const added = await executor
		.insert(taskLabelAssignments)
		.values(labelIds.map((labelId) => ({ taskId, labelId })))
		.onConflictDoNothing()
		.returning();
	return added.map((row) => row.labelId);
}

export async function removeTaskLabels(
	executor: Executor,
	taskId: string,
	labelIds: string[],
) {
	if (labelIds.length === 0) return [];
	const removed = await executor
		.delete(taskLabelAssignments)
		.where(
			and(
				eq(taskLabelAssignments.taskId, taskId),
				inArray(taskLabelAssignments.labelId, labelIds),
			),
		)
		.returning();
	return removed.map((row) => row.labelId);
}

/** Makes a task's labels exactly these names. */
export async function setTaskLabels(
	executor: Executor,
	args: { organizationId: string; taskId: string; names: string[] },
) {
	const labels = await ensureLabels(executor, args.organizationId, args.names);
	const current = await executor
		.select({ labelId: taskLabelAssignments.labelId })
		.from(taskLabelAssignments)
		.where(eq(taskLabelAssignments.taskId, args.taskId));
	const next = new Set(labels.map((label) => label.id));
	const previous = new Set(current.map((row) => row.labelId));
	return {
		added: await addTaskLabels(
			executor,
			args.taskId,
			[...next].filter((id) => !previous.has(id)),
		),
		removed: await removeTaskLabels(
			executor,
			args.taskId,
			[...previous].filter((id) => !next.has(id)),
		),
	};
}
