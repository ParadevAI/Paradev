import {
	mentionedUserIds,
	type NotionComment,
	type NotionDataSource,
	type NotionPage,
	pageTitle,
	plainText,
	retrieveComment,
	retrieveDataSource,
	retrievePage,
} from "@superset/trpc/integrations/notion";
import { z } from "zod";

/**
 * A Notion delivery names an entity and says what happened to it; it carries
 * none of the content. Everything a trigger filters on — which data source,
 * which page, who wrote it, who it mentions — is fetched here.
 */

export const notionWebhookEventSchema = z.object({
	id: z.string().min(1),
	timestamp: z.string(),
	workspace_id: z.string().min(1),
	workspace_name: z.string().nullish(),
	type: z.string().min(1),
	authors: z.array(z.object({ id: z.string(), type: z.string() })).optional(),
	attempt_number: z.number().optional(),
	entity: z.object({ id: z.string().min(1), type: z.string() }),
	data: z
		.looseObject({
			page_id: z.string().optional(),
			parent: z.object({ id: z.string(), type: z.string() }).optional(),
		})
		.optional(),
});
export type NotionWebhookEvent = z.infer<typeof notionWebhookEventSchema>;

/** The delivery types this provider turns into automation events. */
export const HANDLED_EVENT_TYPES = new Set([
	"comment.created",
	"data_source.content_updated",
]);

export type FetchedNotionEvent = {
	dataSourceId: string | null;
	pageId: string | null;
	actorId: string | null;
	mentionedUserIds: string[];
	body: string | null;
	title: string;
	url: string | null;
	/** Runs debounce per subject; a page's comments are one subject. */
	resourceKey: string;
	/** The delivery plus what was fetched, kept for the run's prompt. */
	payload: {
		event: NotionWebhookEvent;
		comment?: NotionComment;
		page?: NotionPage;
		dataSource?: NotionDataSource;
	};
};

function dataSourceOf(page: NotionPage): string | null {
	const parent = page.parent;
	if (parent.type === "data_source_id") return parent.data_source_id;
	// Only older API versions answer with database_id; kept so a stale
	// response still attributes the row to something rather than nothing.
	if (parent.type === "database_id") return parent.database_id;
	return null;
}

export async function fetchNotionEvent(
	accessToken: string,
	event: NotionWebhookEvent,
): Promise<FetchedNotionEvent> {
	switch (event.type) {
		case "comment.created": {
			const comment = await retrieveComment(accessToken, event.entity.id);
			// The delivery names the page; a block comment's own parent is the
			// block, so the page id has to come from the delivery when present.
			const pageId =
				event.data?.page_id ??
				(comment.parent.type === "page_id" ? comment.parent.page_id : null);
			const page = pageId ? await retrievePage(accessToken, pageId) : null;
			return {
				dataSourceId: page ? dataSourceOf(page) : null,
				pageId,
				actorId: comment.created_by.id,
				mentionedUserIds: mentionedUserIds(comment.rich_text),
				body: plainText(comment.rich_text) || null,
				title: (page && pageTitle(page)) || "Untitled",
				url: page?.url ?? null,
				resourceKey: `notion:${pageId ?? comment.id}`,
				payload: { event, comment, ...(page ? { page } : {}) },
			};
		}
		case "data_source.content_updated": {
			const dataSource = await retrieveDataSource(accessToken, event.entity.id);
			return {
				dataSourceId: event.entity.id,
				pageId: null,
				actorId: event.authors?.[0]?.id ?? null,
				mentionedUserIds: [],
				body: null,
				title: plainText(dataSource.title) || "Untitled",
				url: dataSource.url ?? null,
				resourceKey: `notion:${event.entity.id}`,
				payload: { event, dataSource },
			};
		}
		default:
			throw new Error(`Unhandled Notion event type ${event.type}`);
	}
}
