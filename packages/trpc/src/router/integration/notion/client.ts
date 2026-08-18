/**
 * The slice of Notion's REST API the integration uses. Plain fetch rather than
 * the SDK: four endpoints, one header, and no dependency to keep in step with
 * the API version pinned here.
 */

const NOTION_API = "https://api.notion.com";
/** Data sources became first-class objects in this version. */
export const NOTION_VERSION = "2025-09-03";
/** A stalled Notion response must not hold a webhook delivery open indefinitely. */
const REQUEST_TIMEOUT_MS = 15_000;

export class NotionApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "NotionApiError";
	}

	/** True when retrying will not help — the token, capability or entity is gone. */
	get permanent(): boolean {
		return [400, 401, 403, 404].includes(this.status);
	}
}

export async function notionRequest<T>(
	accessToken: string,
	path: string,
	init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
	const response = await fetch(`${NOTION_API}${path}`, {
		method: init.method ?? "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Notion-Version": NOTION_VERSION,
			...(init.body !== undefined
				? { "Content-Type": "application/json" }
				: {}),
		},
		body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		const error = (await response.json().catch(() => ({}))) as {
			code?: string;
			message?: string;
		};
		throw new NotionApiError(
			response.status,
			error.code ?? "unknown",
			error.message ?? `Notion API ${response.status}`,
		);
	}
	return (await response.json()) as T;
}

export type NotionRichText = {
	type: string;
	plain_text?: string;
	mention?: { type: string; user?: { id: string } };
};

export type NotionUser = {
	object: "user";
	id: string;
	type?: "person" | "bot";
	name?: string | null;
	avatar_url?: string | null;
	person?: { email?: string };
};

export type NotionComment = {
	object: "comment";
	id: string;
	parent:
		| { type: "page_id"; page_id: string }
		| { type: "block_id"; block_id: string };
	discussion_id: string;
	created_time: string;
	created_by: { object: "user"; id: string };
	rich_text: NotionRichText[];
	display_name?: { type: string; resolved_name: string | null };
};

export type NotionParent =
	| { type: "data_source_id"; data_source_id: string; database_id?: string }
	| { type: "database_id"; database_id: string }
	| { type: "page_id"; page_id: string }
	| { type: "block_id"; block_id: string }
	| { type: "workspace"; workspace: true };

export type NotionPage = {
	object: "page";
	id: string;
	parent: NotionParent;
	url?: string;
	properties?: Record<
		string,
		{ type: string; title?: NotionRichText[] } | undefined
	>;
};

export type NotionDataSource = {
	object: "data_source";
	id: string;
	title?: NotionRichText[];
	url?: string;
	parent?: NotionParent;
};

type Paginated<T> = {
	results: T[];
	has_more: boolean;
	next_cursor: string | null;
};

export function plainText(richText: NotionRichText[] | undefined): string {
	return (richText ?? []).map((t) => t.plain_text ?? "").join("");
}

/** The user ids a comment @-mentions. Page and date mentions do not count. */
export function mentionedUserIds(
	richText: NotionRichText[] | undefined,
): string[] {
	const ids = new Set<string>();
	for (const item of richText ?? []) {
		if (item.type !== "mention") continue;
		if (item.mention?.type !== "user") continue;
		if (item.mention.user?.id) ids.add(item.mention.user.id);
	}
	return [...ids];
}

export function pageTitle(page: NotionPage): string | null {
	for (const property of Object.values(page.properties ?? {})) {
		if (property?.type === "title") {
			const title = plainText(property.title);
			if (title) return title;
		}
	}
	return null;
}

export function retrieveComment(accessToken: string, commentId: string) {
	return notionRequest<NotionComment>(
		accessToken,
		`/v1/comments/${encodeURIComponent(commentId)}`,
	);
}

export function retrievePage(accessToken: string, pageId: string) {
	return notionRequest<NotionPage>(
		accessToken,
		`/v1/pages/${encodeURIComponent(pageId)}`,
	);
}

export function retrieveDataSource(accessToken: string, dataSourceId: string) {
	return notionRequest<NotionDataSource>(
		accessToken,
		`/v1/data_sources/${encodeURIComponent(dataSourceId)}`,
	);
}

/** Bounds a picker list at this many pages of 100; more is not pickable one by one anyway. */
const MAX_PAGES = 5;

/** Every data source the connection can see, by title. */
export async function listDataSources(
	accessToken: string,
): Promise<NotionDataSource[]> {
	const results: NotionDataSource[] = [];
	let cursor: string | undefined;
	let pages = 0;
	do {
		const page = await notionRequest<Paginated<NotionDataSource>>(
			accessToken,
			"/v1/search",
			{
				method: "POST",
				body: {
					filter: { property: "object", value: "data_source" },
					page_size: 100,
					...(cursor ? { start_cursor: cursor } : {}),
				},
			},
		);
		results.push(...page.results);
		pages += 1;
		cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
	} while (cursor && pages < MAX_PAGES);
	return results;
}

/** Every person in the workspace. Bots are left out: nobody filters on them. */
export async function listUsers(accessToken: string): Promise<NotionUser[]> {
	const results: NotionUser[] = [];
	let cursor: string | undefined;
	let pages = 0;
	do {
		const query = new URLSearchParams({ page_size: "100" });
		if (cursor) query.set("start_cursor", cursor);
		const page = await notionRequest<Paginated<NotionUser>>(
			accessToken,
			`/v1/users?${query}`,
		);
		results.push(...page.results.filter((u) => u.type === "person"));
		pages += 1;
		cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
	} while (cursor && pages < MAX_PAGES);
	return results;
}
