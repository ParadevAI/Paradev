import { dbWs } from "@superset/db/client";
import {
	githubRepositories,
	organizations,
	v2Projects,
} from "@superset/db/schema";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { del } from "@vercel/blob";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { jwtProcedure } from "../../trpc";
import { verifyOrgOwner } from "../integration/utils";
import { requireOrgScopedResource } from "../utils/org-resource-access";

export const v2ProjectRouter = {
	get: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			const row = await requireOrgScopedResource(
				() =>
					dbWs.query.v2Projects.findFirst({
						where: eq(v2Projects.id, input.id),
						with: { githubRepository: true },
					}),
				{
					message: "Project not found",
					organizationId: input.organizationId,
				},
			);
			return row;
		}),

	findByGitHubRemote: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				repoCloneUrl: z.string().min(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			const parsed = parseGitHubRemote(input.repoCloneUrl);
			if (!parsed) return { candidates: [] };
			// GitHub slugs are case-insensitive; parseGitHubRemote returns a
			// canonical https URL. Compare lower-cased on both sides.
			const canonicalUrl = parsed.url.toLowerCase();

			const rows = await dbWs
				.select({
					id: v2Projects.id,
					name: v2Projects.name,
					slug: v2Projects.slug,
					organizationId: v2Projects.organizationId,
					organizationName: organizations.name,
				})
				.from(v2Projects)
				.innerJoin(
					organizations,
					eq(v2Projects.organizationId, organizations.id),
				)
				.where(
					and(
						eq(sql`lower(${v2Projects.repoCloneUrl})`, canonicalUrl),
						eq(v2Projects.organizationId, input.organizationId),
					),
				);

			return { candidates: rows };
		}),

	linkRepoCloneUrl: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				repoCloneUrl: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			const parsed = parseGitHubRemote(input.repoCloneUrl);
			if (!parsed) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Could not parse GitHub remote URL",
				});
			}
			const canonicalUrl = parsed.url;

			await requireOrgScopedResource(
				() =>
					dbWs.query.v2Projects.findFirst({
						columns: { id: true, organizationId: true },
						where: eq(v2Projects.id, input.id),
					}),
				{
					message: "Project not found",
					organizationId: input.organizationId,
				},
			);

			const fullNameLower = `${parsed.owner}/${parsed.name}`.toLowerCase();
			const repo = await dbWs.query.githubRepositories.findFirst({
				columns: { id: true },
				where: and(
					eq(sql`lower(${githubRepositories.fullName})`, fullNameLower),
					eq(githubRepositories.organizationId, input.organizationId),
				),
			});

			const [updated] = await dbWs
				.update(v2Projects)
				.set({
					repoCloneUrl: canonicalUrl,
					githubRepositoryId: repo?.id ?? null,
				})
				.where(
					and(
						eq(v2Projects.id, input.id),
						eq(v2Projects.organizationId, input.organizationId),
						isNull(v2Projects.repoCloneUrl),
					),
				)
				.returning();
			if (!updated) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Project already has a linked repository",
				});
			}

			return updated;
		}),

	delete: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgOwner(ctx.userId, input.organizationId);
			const project = await dbWs.query.v2Projects.findFirst({
				columns: { id: true, organizationId: true, iconUrl: true },
				where: eq(v2Projects.id, input.id),
			});
			// Idempotent on missing: if it's already gone (or scoped to a
			// different org), treat as success. Cloud-first delete pipelines
			// rely on this so retries don't error after a partial success.
			if (!project || project.organizationId !== input.organizationId) {
				return { success: true };
			}
			await dbWs.delete(v2Projects).where(eq(v2Projects.id, project.id));
			if (project.iconUrl) {
				try {
					await del(project.iconUrl);
				} catch (error) {
					console.warn("Failed to delete project icon from blob storage", {
						projectId: project.id,
						iconUrl: project.iconUrl,
						error,
					});
				}
			}
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
