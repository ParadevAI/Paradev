import type { LinearClient } from "@linear/sdk";
import { db, dbWs } from "@superset/db/client";
import {
	integrationConnections,
	type LinearConfig,
	taskStatuses,
	tasks,
} from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import { callLinear } from "./refresh";

type Named = { id: string; name: string };
type TeamScoped = Named & { team: { key: string } | null };
type Page<T> = {
	nodes: T[];
	pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

const PAGE_INFO = "pageInfo { hasNextPage endCursor }";
const TRIGGER_OPTION_CONNECTIONS = {
	teams: `teams(first: 250, after: $after) { nodes { id name } ${PAGE_INFO} }`,
	projects: `projects(first: 250, after: $after) { nodes { id name } ${PAGE_INFO} }`,
	issueLabels: `issueLabels(first: 250, after: $after) { nodes { id name team { key } } ${PAGE_INFO} }`,
	workflowStates: `workflowStates(first: 250, after: $after) { nodes { id name team { key } } ${PAGE_INFO} }`,
} as const;
type ConnectionName = keyof typeof TRIGGER_OPTION_CONNECTIONS;
type TriggerOptionsQuery = {
	teams: Page<Named>;
	projects: Page<Named>;
	issueLabels: Page<TeamScoped>;
	workflowStates: Page<TeamScoped>;
};

// A workspace can outgrow one page (250, Linear's cap) of labels or states.
// The common case is still one round trip: only a connection that reports
// more pages is followed, on its own. Bounded so a misbehaving API cannot
// keep the request open forever.
const MAX_PAGES = 20;

async function fetchAllTriggerOptions(
	client: LinearClient,
): Promise<TriggerOptionsQuery> {
	const query = (names: ConnectionName[]) =>
		`query TriggerOptions($after: String) { ${names
			.map((n) => TRIGGER_OPTION_CONNECTIONS[n])
			.join(" ")} }`;
	const request = (names: ConnectionName[], after: string | null) =>
		client.client.request<
			Partial<TriggerOptionsQuery>,
			{ after: string | null }
		>(query(names), { after });

	const names = Object.keys(TRIGGER_OPTION_CONNECTIONS) as ConnectionName[];
	const result = (await request(names, null)) as TriggerOptionsQuery;
	for (const name of names) {
		const all: Array<Named | TeamScoped> = result[name].nodes;
		let { pageInfo } = result[name];
		for (let i = 1; i < MAX_PAGES && pageInfo.hasNextPage; i++) {
			const next = (await request([name], pageInfo.endCursor))[name];
			if (!next) break;
			all.push(...next.nodes);
			pageInfo = next.pageInfo;
		}
	}
	return result;
}

const MAX_PEOPLE = 1000;

async function fetchAllPeople(
	client: LinearClient,
): Promise<Array<{ id: string; label: string }>> {
	const people: Array<{ id: string; label: string }> = [];
	let page = await client.users({
		first: 250,
		filter: { active: { eq: true } },
	});
	while (true) {
		for (const user of page.nodes) {
			if (user.active === false) continue;
			people.push({ id: user.id, label: user.displayName || user.name });
		}
		if (!page.pageInfo.hasNextPage || people.length >= MAX_PEOPLE) break;
		page = await page.fetchNext();
	}
	return people;
}

export const linearRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "linear"),
				),
				columns: {
					id: true,
					config: true,
					disconnectedAt: true,
					disconnectReason: true,
				},
			});
			if (!connection) return null;
			return {
				config: connection.config as LinearConfig | null,
				needsReconnect: !!connection.disconnectedAt,
				disconnectReason: connection.disconnectReason,
			};
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			try {
				await callLinear(input.organizationId, (client) => client.logout());
			} catch {}

			const result = await dbWs.transaction(async (tx) => {
				// 1. Delete Linear-synced tasks
				await tx
					.delete(tasks)
					.where(
						and(
							eq(tasks.organizationId, input.organizationId),
							eq(tasks.externalProvider, "linear"),
						),
					);

				// 2. Seed default statuses inside the transaction
				const backlogStatusId = await seedDefaultStatuses(
					input.organizationId,
					tx,
				);

				// 3. Remap remaining local tasks from Linear statuses to default statuses
				const allStatuses = await tx.query.taskStatuses.findMany({
					where: eq(taskStatuses.organizationId, input.organizationId),
				});

				const defaultStatusByType = new Map<string, string>();
				for (const status of allStatuses) {
					if (!status.externalProvider && status.type) {
						if (!defaultStatusByType.has(status.type)) {
							defaultStatusByType.set(status.type, status.id);
						}
					}
				}

				for (const status of allStatuses) {
					if (status.externalProvider === "linear") {
						const defaultStatusId =
							(status.type && defaultStatusByType.get(status.type)) ||
							backlogStatusId;
						await tx
							.update(tasks)
							.set({ statusId: defaultStatusId })
							.where(
								and(
									eq(tasks.organizationId, input.organizationId),
									eq(tasks.statusId, status.id),
								),
							);
					}
				}

				// 4. Delete Linear task statuses
				await tx
					.delete(taskStatuses)
					.where(
						and(
							eq(taskStatuses.organizationId, input.organizationId),
							eq(taskStatuses.externalProvider, "linear"),
						),
					);

				// 5. Delete the integration connection
				return tx
					.delete(integrationConnections)
					.where(
						and(
							eq(integrationConnections.organizationId, input.organizationId),
							eq(integrationConnections.provider, "linear"),
						),
					)
					.returning({ id: integrationConnections.id });
			});

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}

			return { success: true };
		}),

	getTeams: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const teams = await callLinear(input.organizationId, (client) =>
				client.teams(),
			);
			if (!teams) return [];
			return teams.nodes.map((t) => ({ id: t.id, name: t.name, key: t.key }));
		}),

	/**
	 * Everything a Linear trigger sentence can pick from. Ids throughout: a
	 * team key or state name can be renamed, the id cannot.
	 */
	getTriggerOptions: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const result = await callLinear(
				input.organizationId,
				fetchAllTriggerOptions,
			);
			if (!result) return { teams: [], projects: [], labels: [], statuses: [] };

			// Workflow states and labels repeat their names across teams, so the
			// team key is part of the label rather than a separate column.
			const withTeam = (name: string, team: { key: string } | null) =>
				team ? `${name} · ${team.key}` : name;
			const byLabel = (options: Array<{ id: string; label: string }>) =>
				options.sort((a, b) => a.label.localeCompare(b.label));
			return {
				teams: byLabel(
					result.teams.nodes.map((t) => ({ id: t.id, label: t.name })),
				),
				projects: byLabel(
					result.projects.nodes.map((p) => ({ id: p.id, label: p.name })),
				),
				labels: byLabel(
					result.issueLabels.nodes.map((l) => ({
						id: l.id,
						label: withTeam(l.name, l.team),
					})),
				),
				statuses: byLabel(
					result.workflowStates.nodes.map((s) => ({
						id: s.id,
						label: withTeam(s.name, s.team),
					})),
				),
			};
		}),

	/**
	 * The workspace's active members, keyed by Linear user id — what a
	 * webhook's `assigneeId` and actor id carry.
	 */
	listPeople: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const people = await callLinear(input.organizationId, fetchAllPeople);
			if (!people) return [];
			return people.sort((a, b) => a.label.localeCompare(b.label));
		}),

	updateConfig: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				newTasksTeamId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const config: LinearConfig = {
				provider: "linear",
				newTasksTeamId: input.newTasksTeamId,
			};

			await db
				.update(integrationConnections)
				.set({ config })
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "linear"),
					),
				);

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
