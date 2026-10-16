import { db } from "@superset/db/client";
import { tasks, users } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { pushSystemCard } from "../inbox/systemCards";

/**
 * Puts a task in its new assignee's inbox when someone else assigned it.
 * Assigning yourself, or a sync from Linear, is not news to anyone. Runs after
 * the assignment commits and never fails it.
 */
export async function notifyAssignee(args: {
	taskId: string;
	assigneeId: string;
	actorId: string;
}): Promise<void> {
	if (args.assigneeId === args.actorId) return;
	try {
		const [task] = await db
			.select({
				organizationId: tasks.organizationId,
				title: tasks.title,
				slug: tasks.slug,
			})
			.from(tasks)
			.where(eq(tasks.id, args.taskId))
			.limit(1);
		if (!task) return;
		const [actor] = await db
			.select({ name: users.name })
			.from(users)
			.where(eq(users.id, args.actorId))
			.limit(1);
		await pushSystemCard({
			organizationId: task.organizationId,
			userId: args.assigneeId,
			source: "task",
			key: `task-assigned:${args.taskId}:${args.assigneeId}`,
			title: task.title,
			why: `${actor?.name ?? "Someone"} assigned ${task.slug} to you`,
			card: { type: "superset.task_assigned", refs: { task: args.taskId } },
		});
	} catch (error) {
		console.error(
			`[task] could not tell the assignee of ${args.taskId}`,
			error,
		);
	}
}
