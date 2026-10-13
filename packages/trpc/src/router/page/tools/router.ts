import { db } from "@superset/db/client";
import { pages, pageToolGrants, pluginInstalls } from "@superset/db/schema";
import { MAX_PAGE_TOOL_NAME_LENGTH } from "@superset/shared/page-tools";
import { firstPartyManifest, getPluginByName } from "@superset/shared/plugins";
import type { TRPCRouterRecord } from "@trpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import { protectedProcedure, userError } from "../../../trpc";
import {
	type PluginManifest,
	pluginNeedsConnection,
	supersetExtension,
} from "../../plugins/manifest";
import { resolveTarget } from "../../plugins/proxy";
import { requireActiveOrgMembership } from "../../utils/active-org";
import { callPageTool, pageToolAccess, pinForGrant } from "./call-page-tool";
import { callPluginTool } from "./call-plugin-tool";

const name = z.string().min(1).max(MAX_PAGE_TOOL_NAME_LENGTH);

const toolRateLimit =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Ratelimit({
				redis: new Redis({
					url: env.KV_REST_API_URL,
					token: env.KV_REST_API_TOKEN,
				}),
				limiter: Ratelimit.slidingWindow(120, "1 m"),
				prefix: "ratelimit:page:tools",
			})
		: null;

async function readablePage(
	pageId: string,
	organizationId: string,
	userId: string,
) {
	const [page] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.id, pageId), eq(pages.organizationId, organizationId)))
		.limit(1);
	if (!page || pageToolAccess(page, userId) === "not_found") {
		throw userError({
			code: "NOT_FOUND",
			message: "Page not found",
			i18nKey: "serverError.page.pageNotFound",
		});
	}
	return page;
}

async function installedPluginInfo(
	userId: string,
	plugin: string,
): Promise<{ label: string; accountless: boolean } | null> {
	const known = getPluginByName(plugin);
	if (known) {
		const manifest = firstPartyManifest(plugin) as PluginManifest | null;
		return {
			label: known.interface.displayName,
			accountless: manifest !== null && !pluginNeedsConnection(manifest),
		};
	}
	const [install] = await db
		.select({ manifest: pluginInstalls.manifest })
		.from(pluginInstalls)
		.where(
			and(
				eq(pluginInstalls.userId, userId),
				eq(pluginInstalls.pluginName, plugin),
			),
		)
		.orderBy(asc(pluginInstalls.marketplace))
		.limit(1);
	if (!install) return null;
	const manifest = install.manifest as PluginManifest;
	return {
		label: supersetExtension(manifest)?.interface?.displayName ?? plugin,
		accountless: !pluginNeedsConnection(manifest),
	};
}

async function withinRateLimit(key: string): Promise<boolean> {
	if (!toolRateLimit) return true;
	try {
		return (await toolRateLimit.limit(key)).success;
	} catch (error) {
		console.error("[page/tools] rate limiter unavailable:", error);
		return true;
	}
}

export const pageToolRouter = {
	callTool: protectedProcedure
		.input(
			z.object({
				pageId: z.string().uuid(),
				plugin: name,
				tool: name,
				args: z.record(z.string(), z.unknown()).default({}),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const page = await readablePage(input.pageId, organizationId, userId);
			if (!(await withinRateLimit(`${userId}:${page.id}`))) {
				return {
					status: "error" as const,
					code: "rate_limited" as const,
					message: "Too many tool calls from this page; slow down",
				};
			}
			return callPageTool(
				{
					findGrant: async (pageId, viewerId, plugin) => {
						const [grant] = await db
							.select({ connectionId: pageToolGrants.connectionId })
							.from(pageToolGrants)
							.where(
								and(
									eq(pageToolGrants.pageId, pageId),
									eq(pageToolGrants.userId, viewerId),
									eq(pageToolGrants.plugin, plugin),
								),
							)
							.limit(1);
						return grant ?? null;
					},
					resolveTarget,
					callTool: callPluginTool,
					pluginInfo: installedPluginInfo,
					pinGrant: async (pageId, viewerId, plugin, connectionId) => {
						const saved = await db
							.update(pageToolGrants)
							.set({ connectionId })
							.where(
								and(
									eq(pageToolGrants.pageId, pageId),
									eq(pageToolGrants.userId, viewerId),
									eq(pageToolGrants.plugin, plugin),
									isNull(pageToolGrants.connectionId),
								),
							)
							.returning({ plugin: pageToolGrants.plugin });
						return saved.length > 0;
					},
				},
				{
					pageId: page.id,
					userId,
					organizationId,
					plugin: input.plugin,
					tool: input.tool,
					args: input.args,
				},
			);
		}),

	grantTool: protectedProcedure
		.input(
			z.object({
				pageId: z.string().uuid(),
				plugin: name,
				connectionId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const page = await readablePage(input.pageId, organizationId, userId);
			const connectionId =
				input.connectionId ??
				(await resolveTarget({
					userId,
					organizationId,
					plugin: input.plugin,
					connectionId: null,
				})
					.then(pinForGrant)
					.catch(() => null));
			await db
				.insert(pageToolGrants)
				.values({
					pageId: page.id,
					userId,
					plugin: input.plugin,
					connectionId,
				})
				.onConflictDoUpdate({
					target: [
						pageToolGrants.pageId,
						pageToolGrants.userId,
						pageToolGrants.plugin,
					],
					set: { connectionId },
				});
			return { ok: true as const };
		}),

	revokeTool: protectedProcedure
		.input(z.object({ pageId: z.string().uuid(), plugin: name }))
		.mutation(async ({ ctx, input }) => {
			await db
				.delete(pageToolGrants)
				.where(
					and(
						eq(pageToolGrants.pageId, input.pageId),
						eq(pageToolGrants.userId, ctx.session.user.id),
						eq(pageToolGrants.plugin, input.plugin),
					),
				);
			return { ok: true as const };
		}),

	toolGrants: protectedProcedure
		.input(z.object({ pageId: z.string().uuid() }))
		.query(async ({ ctx, input }) =>
			db
				.select({
					plugin: pageToolGrants.plugin,
					connectionId: pageToolGrants.connectionId,
					createdAt: pageToolGrants.createdAt,
				})
				.from(pageToolGrants)
				.where(
					and(
						eq(pageToolGrants.pageId, input.pageId),
						eq(pageToolGrants.userId, ctx.session.user.id),
					),
				),
		),
} satisfies TRPCRouterRecord;
