// usage/* worker tasks. They run in the usage worker (usage-worker-pool.ts),
// which keeps the usage index warm between requests.

import type {
	CwdLabel,
	UsageHistory,
} from "../../trpc/router/usage/history/aggregate.ts";
import { computeUsageHistory } from "../../trpc/router/usage/history/aggregate.ts";
import type { LeaderboardPayload } from "../../trpc/router/usage/history/leaderboard-days.ts";
import { computeLeaderboardPayload } from "../../trpc/router/usage/history/leaderboard-days.ts";
import { collectFromIndex } from "../../trpc/router/usage/history/usage-index.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export const usageHistoryTask = defineWorkerTask<
	{ days: number; cwdLabels: CwdLabel[] },
	UsageHistory
>({
	type: "usage/history",
	handler: ({ days, cwdLabels }) =>
		computeUsageHistory(days, cwdLabels, collectFromIndex),
});

export const leaderboardPayloadTask = defineWorkerTask<
	{ days: number; nowMs: number; agentPrsByDay: Record<string, number> },
	LeaderboardPayload
>({
	type: "usage/leaderboard-payload",
	handler: ({ days, nowMs, agentPrsByDay }) =>
		computeLeaderboardPayload(
			days,
			agentPrsByDay,
			new Date(nowMs),
			collectFromIndex,
		),
});

export const usageTasks = [usageHistoryTask, leaderboardPayloadTask];
