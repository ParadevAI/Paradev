import { db } from "@superset/db/client";
import {
	githubUserConnections,
	members,
	organizationPluginSources,
	organizationPlugins,
	pluginInstalls,
} from "@superset/db/schema";
import { ROLE_HIERARCHY } from "@superset/shared/auth";
import {
	ORGANIZATION_PLUGIN_ACCESS,
	organizationMarketplace,
	organizationPluginAccess,
} from "@superset/shared/plugins";
import type { TRPCRouterRecord } from "@trpc/server";
import { Client } from "@upstash/qstash";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { userError } from "../../i18n-error";
import {
	githubRepositoriesOutOfReach,
	githubUserTokenFor,
} from "../../lib/github-user";
import {
	accessiblePlugin,
	accessibleTo,
	memberRole,
	ORGANIZATION_PLUGIN_SYNC_PATH,
	organizationBundleKey,
	syncOrganizationPluginSource,
} from "../../lib/organization-plugins";
import { deleteObjects, getObject } from "../../lib/r2";
import { nudge } from "../../lib/realtime";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin } from "../integration/utils";
import { requireActiveOrgId } from "../utils/active-org";
import { type PluginManifest, pluginConnector } from "./manifest";

const qstash = new Client({ token: env.QSTASH_TOKEN });

function unknown(name: string) {
	return userError({
		code: "NOT_FOUND",
		message: `Unknown plugin "${name}"`,
		i18nKey: "serverError.plugins.unknownPlugin",
		params: { plugin: name },
	});
}

function unknownSource() {
	return userError({
		code: "NOT_FOUND",
		message: "That plugin source does not exist",
		i18nKey: "serverError.plugins.unknownPluginSource",
	});
}

async function requireAdmin(ctx: Parameters<typeof requireActiveOrgId>[0]) {
	const organizationId = requireActiveOrgId(ctx);
	await verifyOrgAdmin(ctx.session.user.id, organizationId);
	return organizationId;
}

async function isAdmin(userId: string, organizationId: string) {
	return verifyOrgAdmin(userId, organizationId).then(
		() => true,
		() => false,
	);
}

async function requestSync(sourceId: string) {
	if (env.NODE_ENV === "development") {
		await syncOrganizationPluginSource(sourceId);
		return;
	}
	await qstash.publishJSON({
		url: `${env.NEXT_PUBLIC_API_URL}${ORGANIZATION_PLUGIN_SYNC_PATH}`,
		body: { sourceId },
		retries: 3,
	});
}

/** The repository the adding admin's GitHub account reads, which every later sync reads it with. */
async function reachableRepository(userId: string, repo: string) {
	const token = await githubUserTokenFor(userId);
	if (!token) {
		throw userError({
			code: "PRECONDITION_FAILED",
			message:
				"Connect your GitHub account to add a repository; syncs read it with your account",
			i18nKey: "serverError.plugins.pluginSourceNeedsGithub",
		});
	}
	const [owner = "", name = ""] = repo.split("/");
	const outOfReach = await githubRepositoriesOutOfReach({
		token,
		repositories: [{ owner, name, fullName: repo }],
	});
	if (outOfReach.length) {
		throw userError({
			code: "FORBIDDEN",
			message: `Your GitHub account cannot read ${repo}`,
			i18nKey: "serverError.plugins.pluginSourceOutOfReach",
			params: { repo },
		});
	}
	return repo;
}

const policySchema = z.partialRecord(
	z.enum(ROLE_HIERARCHY),
	z.enum(ORGANIZATION_PLUGIN_ACCESS),
);

const sourcesRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireAdmin(ctx);
		const rows = await db
			.select({
				source: organizationPluginSources,
				syncsAsGithubLogin: githubUserConnections.login,
			})
			.from(organizationPluginSources)
			.leftJoin(
				githubUserConnections,
				eq(
					githubUserConnections.userId,
					organizationPluginSources.addedByUserId,
				),
			)
			.where(eq(organizationPluginSources.organizationId, organizationId))
			.orderBy(asc(organizationPluginSources.repo));
		return rows.map(({ source, syncsAsGithubLogin }) => ({
			...source,
			syncsAsGithubLogin,
		}));
	}),

	add: protectedProcedure
		.input(
			z.object({
				repo: z
					.string()
					.regex(
						/^(?!\.{1,2}\/)[\w.-]+\/(?!\.{1,2}$)[\w.-]+$/,
						"owner/name of a GitHub repository",
					),
				ref: z.string().min(1).optional(),
				path: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);
			const repo = await reachableRepository(ctx.session.user.id, input.repo);
			const path = (input.path ?? "")
				.split("/")
				.filter((s) => s && s !== ".")
				.join("/");
			if (path.split("/").includes("..")) {
				throw userError({
					code: "BAD_REQUEST",
					message: "The path must stay inside the repository",
					i18nKey: "serverError.plugins.pluginSourcePathOutside",
				});
			}

			const [source] = await db
				.insert(organizationPluginSources)
				.values({
					organizationId,
					repo,
					ref: input.ref ?? null,
					path,
					addedByUserId: ctx.session.user.id,
				})
				.onConflictDoUpdate({
					target: [
						organizationPluginSources.organizationId,
						organizationPluginSources.repo,
						organizationPluginSources.path,
					],
					set: { ref: input.ref ?? null, addedByUserId: ctx.session.user.id },
				})
				.returning();
			if (!source) throw unknownSource();

			await requestSync(source.id);
			return source;
		}),

	sync: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);
			const source = await db.query.organizationPluginSources.findFirst({
				where: and(
					eq(organizationPluginSources.id, input.id),
					eq(organizationPluginSources.organizationId, organizationId),
				),
			});
			if (!source) throw unknownSource();
			await requestSync(source.id);
			return { requested: source.id };
		}),

	remove: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);
			const bundles = await db
				.select({ contentHash: organizationPlugins.contentHash })
				.from(organizationPlugins)
				.where(
					and(
						eq(organizationPlugins.sourceId, input.id),
						eq(organizationPlugins.organizationId, organizationId),
					),
				);
			const [row] = await db
				.delete(organizationPluginSources)
				.where(
					and(
						eq(organizationPluginSources.id, input.id),
						eq(organizationPluginSources.organizationId, organizationId),
					),
				)
				.returning({ id: organizationPluginSources.id });
			if (!row) throw unknownSource();
			await deleteObjects(
				bundles.map((bundle) =>
					organizationBundleKey(organizationId, bundle.contentHash),
				),
			).catch((error) =>
				console.warn(
					"[organization-plugins] bundles left for the sweep",
					error,
				),
			);
			nudge(organizationId, "plugins");
			return { removed: row.id };
		}),
} satisfies TRPCRouterRecord;

export const organizationPluginsRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = requireActiveOrgId(ctx);
		const userId = ctx.session.user.id;
		const admin = await isAdmin(userId, organizationId);
		const role = await memberRole(userId, organizationId);
		const rows = await db
			.select({
				plugin: organizationPlugins,
				repo: organizationPluginSources.repo,
			})
			.from(organizationPlugins)
			.leftJoin(
				organizationPluginSources,
				eq(organizationPluginSources.id, organizationPlugins.sourceId),
			)
			.where(
				and(
					eq(organizationPlugins.organizationId, organizationId),
					admin ? undefined : accessibleTo(role),
				),
			)
			.orderBy(asc(organizationPlugins.name));

		return rows.map(({ plugin, repo }) => ({
			name: plugin.name,
			version: plugin.version,
			marketplace: organizationMarketplace(organizationId),
			description: (plugin.manifest as PluginManifest).description ?? "",
			connector: pluginConnector(plugin.manifest as PluginManifest) ?? null,
			sourceId: plugin.sourceId,
			repo: repo ?? null,
			policy: plugin.installPolicy,
			removedFromSourceAt: plugin.removedFromSourceAt,
			updatedAt: plugin.updatedAt,
		}));
	}),

	bundle: protectedProcedure
		.input(z.object({ name: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			const role = await memberRole(ctx.session.user.id, organizationId);
			const plugin = await accessiblePlugin(organizationId, role, input.name);
			if (!plugin) throw unknown(input.name);
			const row = {
				name: plugin.name,
				version: plugin.version,
				contentHash: plugin.contentHash,
			};

			const object = await getObject(
				organizationBundleKey(organizationId, row.contentHash),
			);
			if (!object) throw unknown(input.name);
			return {
				...row,
				marketplace: organizationMarketplace(organizationId),
				bundle: Buffer.from(await object.arrayBuffer()).toString("base64"),
			};
		}),

	setPolicy: protectedProcedure
		.input(z.object({ name: z.string().min(1), policy: policySchema }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireAdmin(ctx);
			const [row] = await db
				.update(organizationPlugins)
				.set({
					installPolicy: sql`${organizationPlugins.installPolicy} || ${JSON.stringify(input.policy)}::jsonb`,
				})
				.where(
					and(
						eq(organizationPlugins.organizationId, organizationId),
						eq(organizationPlugins.name, input.name),
					),
				)
				.returning();
			if (!row) throw unknown(input.name);
			const revoked = ROLE_HIERARCHY.filter(
				(role) =>
					role in input.policy &&
					organizationPluginAccess(row.installPolicy, role) === "unavailable",
			);
			const losing = revoked.length
				? await db
						.select({ userId: members.userId })
						.from(members)
						.where(
							and(
								eq(members.organizationId, organizationId),
								inArray(members.role, revoked),
							),
						)
				: [];
			if (losing.length) {
				await db.delete(pluginInstalls).where(
					and(
						eq(pluginInstalls.organizationPluginId, row.id),
						inArray(
							pluginInstalls.userId,
							losing.map((member) => member.userId),
						),
					),
				);
			}
			nudge(organizationId, "plugins");
			return { name: row.name, policy: row.installPolicy };
		}),

	sources: sourcesRouter,
} satisfies TRPCRouterRecord;
