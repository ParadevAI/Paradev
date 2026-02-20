import { db } from "@superset/db/client";
import { tasks } from "@superset/db/schema";
import { and, inArray, isNull } from "drizzle-orm";

const TASK_MENTION_REGEX = /@task:([\w-]+)/g;

export function parseTaskMentions(text: string): string[] {
	return [
		...new Set(
			[...text.matchAll(TASK_MENTION_REGEX)]
				.map((m) => m[1])
				.filter((s): s is string => s !== undefined),
		),
	];
}

export async function buildTaskMentionContext(
	slugs: string[],
): Promise<string> {
	if (slugs.length === 0) return "";

	try {
		const rows = await db
			.select()
			.from(tasks)
			.where(and(inArray(tasks.slug, slugs), isNull(tasks.deletedAt)));

		if (rows.length === 0) return "";

		const parts = rows.map(
			(t) =>
				`<task slug="${t.slug}" title="${t.title}" status="${t.statusId}">${t.description ?? ""}</task>`,
		);

		return `\n\nThe user referenced the following tasks. Their details are provided below:\n\n${parts.join("\n\n")}`;
	} catch (error) {
		console.warn("[run-agent] Failed to fetch task mentions:", error);
		return "";
	}
}
