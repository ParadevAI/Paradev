import { db } from "@superset/db/client";
import {
	cloudWorkspaceTasks,
	taskLabelAssignments,
	taskLabels,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type SupersetPerson,
	type TaskAssignedView,
} from "../types";
import { loadWorkspace } from "./supersetWorkspace";

const DESCRIPTION_EXCERPT = 1200;

async function person(userId: string | null): Promise<SupersetPerson | null> {
	if (!userId) return null;
	return (
		(await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { id: true, name: true, image: true },
		})) ?? null
	);
}

interface Data {
	view: TaskAssignedView;
}

/**
 * Someone assigned the reader a task. The card is the task as the task view
 * shows it, with the workspaces already working on it. Starting one happens in
 * the desktop's own run-in-workspace picker; the card records that it did.
 */
export const taskAssigned = defineCard<{ task: string }, Data>({
	type: "superset.task_assigned",
	tier: "update",
	label: "Task assigned",
	ask: "Start the task",
	brand: "superset",
	systemOnly: true,
	refs: z.object({ task: z.string().uuid() }),
	async resolve({ refs, ctx }) {
		const [row] = await db
			.select({
				task: tasks,
				status: {
					name: taskStatuses.name,
					color: taskStatuses.color,
					type: taskStatuses.type,
				},
			})
			.from(tasks)
			.innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
			.where(and(eq(tasks.id, refs.task), isNull(tasks.deletedAt)))
			.limit(1);
		if (!row || row.task.organizationId !== ctx.organizationId)
			throw new CardUnavailable("gone", "That task no longer exists");
		const task = row.task;
		const [assignee, creator, labels, cloudLinks] = await Promise.all([
			person(task.assigneeId),
			person(task.creatorId),
			db
				.select({ name: taskLabels.name, color: taskLabels.color })
				.from(taskLabelAssignments)
				.innerJoin(taskLabels, eq(taskLabels.id, taskLabelAssignments.labelId))
				.where(eq(taskLabelAssignments.taskId, task.id)),
			db
				.select({ id: cloudWorkspaceTasks.cloudWorkspaceId })
				.from(cloudWorkspaceTasks)
				.where(eq(cloudWorkspaceTasks.taskId, task.id)),
		]);
		const workspaces = (
			await Promise.all(
				cloudLinks.map(({ id }) =>
					loadWorkspace(ctx.organizationId, ctx.readerId, id)
						.then((loaded) => loaded.view)
						.catch(() => null),
				),
			)
		).filter((view) => view !== null && view.status !== "deleted");
		const description = task.description
			? task.description
					.replace(/\s+\n/g, "\n")
					.trim()
					.slice(0, DESCRIPTION_EXCERPT)
			: null;
		const view: TaskAssignedView = {
			kind: "superset.task_assigned",
			task: {
				id: task.id,
				slug: task.slug,
				title: task.title,
				description,
				priority: task.priority,
				status: row.status,
				assignee,
				creator,
				branch: task.branch,
				dueDate: task.dueDate?.toISOString() ?? null,
				labels,
			},
			workspaces: workspaces as TaskAssignedView["workspaces"],
		};
		const fields: CardField[] = [
			{ label: "Status", value: row.status.name },
			{ label: "Priority", value: task.priority },
			...(assignee ? [{ label: "Assignee", value: assignee.name }] : []),
		];
		return {
			title: "Task assigned",
			subtitle: task.slug,
			fields,
			body: description ?? undefined,
			view,
			data: { view },
		};
	},
	actions: {
		started: {
			label: () => "I started it",
			style: "primary",
			role: "primary",
			async run() {
				return { outcome: { started: true } };
			},
		},
	},
});
