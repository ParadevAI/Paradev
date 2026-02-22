import {
	createApiTrpcClient,
	type GetHeaders,
} from "../../../../../../lib/auth/auth";

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
	options: { apiUrl?: string; getHeaders?: GetHeaders },
): Promise<string> {
	if (slugs.length === 0) return "";
	if (!options.apiUrl || !options.getHeaders) return "";

	try {
		const client = createApiTrpcClient({
			apiUrl: options.apiUrl,
			getHeaders: options.getHeaders,
		});
		const tasksBySlug = await Promise.all(
			slugs.map((slug) => client.task.bySlug.query(slug)),
		);
		const rows = tasksBySlug.filter(
			(task): task is NonNullable<typeof task> => task !== null,
		);

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
