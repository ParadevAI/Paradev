import { and, eq, gte, isNotNull, lte, or } from "drizzle-orm";
import type { HostDb } from "../../../../db";
import {
	pullRequests,
	terminalAgentBindings,
	workspacePullRequests,
	workspaces,
} from "../../../../db/schema";
import type { UsageHistory } from "./aggregate";

export interface WrappedPrs {
	total: number;
	byAgent: Record<string, number>;
}

export function countWrappedPrs(
	db: HostDb,
	days: number,
	now = new Date(),
): WrappedPrs {
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - days + 1);
	const rows = db
		.selectDistinct({
			id: pullRequests.id,
			agent: terminalAgentBindings.agentId,
		})
		.from(pullRequests)
		.innerJoin(
			workspacePullRequests,
			eq(workspacePullRequests.pullRequestId, pullRequests.id),
		)
		.leftJoin(
			terminalAgentBindings,
			and(
				eq(
					terminalAgentBindings.workspaceId,
					workspacePullRequests.workspaceId,
				),
				lte(terminalAgentBindings.startedAt, pullRequests.mergedAt),
			),
		)
		.leftJoin(workspaces, eq(workspaces.id, workspacePullRequests.workspaceId))
		.where(
			and(
				isNotNull(pullRequests.mergedAt),
				gte(pullRequests.mergedAt, start.getTime()),
				lte(pullRequests.mergedAt, now.getTime()),
				or(
					isNotNull(terminalAgentBindings.terminalId),
					isNotNull(workspaces.archivedAt),
				),
			),
		)
		.all();
	const byAgent = new Map<string, Set<string>>();
	for (const row of rows) {
		if (!row.agent) continue;
		const agent =
			row.agent === "cursor-agent" || row.agent === "cursor-composer"
				? "cursor"
				: row.agent;
		const ids = byAgent.get(agent) ?? new Set<string>();
		ids.add(row.id);
		byAgent.set(agent, ids);
	}
	return {
		total: new Set(rows.map((row) => row.id)).size,
		byAgent: Object.fromEntries(
			[...byAgent].map(([agent, ids]) => [agent, ids.size]),
		),
	};
}

export function summarizeWrapped(history: UsageHistory, prs: WrappedPrs) {
	const agents = new Map<
		string,
		{ agent: string; tokens: number; usd: number; prs: number }
	>();
	let longestStreak = 0;
	let streak = 0;
	for (const bucket of history.buckets) {
		streak = bucket.tokens > 0 ? streak + 1 : 0;
		longestStreak = Math.max(longestStreak, streak);
		for (const [agent, usage] of Object.entries(bucket.agents)) {
			if (!usage) continue;
			const row = agents.get(agent) ?? {
				agent,
				tokens: 0,
				usd: 0,
				prs: prs.byAgent[agent] ?? 0,
			};
			row.tokens += usage.tokens;
			row.usd += usage.usd;
			agents.set(agent, row);
		}
	}
	for (const [agent, count] of Object.entries(prs.byAgent)) {
		if (!agents.has(agent))
			agents.set(agent, { agent, tokens: 0, usd: 0, prs: count });
	}
	return {
		from: history.buckets[0]?.day ?? "",
		to: history.buckets.at(-1)?.day ?? "",
		tokens: history.totals.tokens,
		usd: history.totals.usd,
		prs: prs.total,
		longestStreak,
		topModel:
			[...history.models].sort((a, b) => b.tokens - a.tokens)[0]?.model ?? null,
		agents: [...agents.values()].sort((a, b) => b.tokens - a.tokens),
	};
}
