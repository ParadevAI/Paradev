import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	type PageStorageReadback,
	type PageStorageWriteRequest,
	pageStorageScopeValues,
} from "@superset/shared/page-storage";
import { pageStorageRecordsPath } from "@superset/shared/page-storage-hub";
import {
	hasPageRef,
	PAGE_REF_MESSAGE,
	pageFields,
} from "@superset/trpc/page-schema";
import { z } from "zod";
import type { McpContext } from "../../auth";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { optionalish } from "../../optionalish";

const scopeField = optionalish(z.enum(pageStorageScopeValues)).describe(
	"slot (default): one value per person, everyone reads all. private: only you read it. shared: one value for everyone, last writer wins.",
);

async function pageIdFor(
	{ id, slug }: { id?: string | null; slug?: string | null },
	ctx: McpContext,
): Promise<string> {
	return (
		id ?? (await createMcpCaller(ctx).page.get({ slug: slug as string })).id
	);
}

async function refusal(response: Response, fallback: string): Promise<never> {
	const error = (
		(await response.json().catch(() => null)) as { error?: string } | null
	)?.error;
	throw new Error(error ?? `${fallback} (${response.status})`);
}

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_storage",
		annotations: { readOnlyHint: true },
		description:
			"Read what viewers stored on a page through window.superset.storage. Each key holds one slot per person, or one private or shared value when scope is set. Without key, lists every key with its record count and last update. With key, returns every person's slot for that key: name, value, and updatedAt. With scope private, you see only your own value. On a just_me page only the creator can read storage; on an org or everyone page, members of the page's organization can, even when the page is public. Anyone else gets an error. Address the page by id or slug; exactly one is required.",
		inputSchema: z
			.object({
				id: optionalish(pageFields.id).describe("Page UUID."),
				slug: optionalish(pageFields.slug).describe("Page slug."),
				key: optionalish(
					z.string().min(1).max(MAX_PAGE_STORAGE_KEY_LENGTH),
				).describe(
					"Storage key to read every person's slot for. Omit to list keys.",
				),
				scope: scopeField,
			})
			.refine(hasPageRef, PAGE_REF_MESSAGE),
		handler: async ({ id, slug, key, scope }, ctx) => {
			const pageId = await pageIdFor({ id, slug }, ctx);
			const path = pageStorageRecordsPath(pageId, key ?? undefined);
			const url =
				scope && scope !== "slot" && key
					? `${ctx.realtimeUrl}${path}&scope=${scope}`
					: `${ctx.realtimeUrl}${path}`;
			const response = await fetch(url, {
				headers: { authorization: `Bearer ${ctx.bearerToken}` },
				signal: AbortSignal.timeout(10_000),
			});
			if (response.ok) return (await response.json()) as PageStorageReadback;
			if (response.status === 404) {
				throw new Error("This page has no published version");
			}
			return refusal(response, "Page storage refused the request");
		},
	});
	const write = async (
		pageId: string,
		request: PageStorageWriteRequest,
		ctx: McpContext,
	) => {
		const response = await fetch(
			`${ctx.realtimeUrl}${pageStorageRecordsPath(pageId)}`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${ctx.bearerToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(request),
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (response.ok) return { ok: true as const };
		return refusal(
			response,
			response.status === 404
				? "Page not found or not published"
				: "Page storage refused the write",
		);
	};

	defineTool(server, {
		name: "pages_storage_set",
		annotations: { destructiveHint: true },
		description:
			"Store a JSON value on a page through window.superset.storage, as you. Use scope shared for data the page renders for everyone, like a dashboard an automation refreshes. Values are at most 64 KiB and a page holds at most 20 MiB. Address the page by id or slug; exactly one is required.",
		inputSchema: z
			.object({
				id: optionalish(pageFields.id).describe("Page UUID."),
				slug: optionalish(pageFields.slug).describe("Page slug."),
				key: z.string().min(1).max(MAX_PAGE_STORAGE_KEY_LENGTH),
				value: z
					.unknown()
					.refine((value) => value !== undefined, {
						message: "value is required; pass null to store null",
					})
					.describe("Any JSON value. Required; null stores null."),
				scope: scopeField,
			})
			.refine(hasPageRef, PAGE_REF_MESSAGE),
		handler: async ({ id, slug, key, value, scope }, ctx) =>
			write(
				await pageIdFor({ id, slug }, ctx),
				{ op: "set", key, value, scope: scope ?? "slot" },
				ctx,
			),
	});

	defineTool(server, {
		name: "pages_storage_remove",
		annotations: { destructiveHint: true },
		description:
			"Remove your value under a key on a page's storage. For scope shared, removes the one shared value. Address the page by id or slug; exactly one is required.",
		inputSchema: z
			.object({
				id: optionalish(pageFields.id).describe("Page UUID."),
				slug: optionalish(pageFields.slug).describe("Page slug."),
				key: z.string().min(1).max(MAX_PAGE_STORAGE_KEY_LENGTH),
				scope: scopeField,
			})
			.refine(hasPageRef, PAGE_REF_MESSAGE),
		handler: async ({ id, slug, key, scope }, ctx) =>
			write(
				await pageIdFor({ id, slug }, ctx),
				{ op: "remove", key, scope: scope ?? "slot" },
				ctx,
			),
	});
}
