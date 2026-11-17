import { and, desc, eq, isNull, max } from "drizzle-orm";
import type { HostDb } from "../db";
import { pullRequestAutoFix, pullRequests, workspaces } from "../db/schema";
import {
	coercePullRequestState,
	parseChecksJson,
} from "../runtime/pull-requests/utils/pull-request-mappers";
import type { PrAutoFixPullRequest, PrAutoFixState } from "./types.ts";

type Row = typeof pullRequestAutoFix.$inferSelect;
type StatePatch = Partial<
	Pick<
		PrAutoFixState,
		| "status"
		| "pauseReason"
		| "attempts"
		| "lastHandledHeadSha"
		| "agentTerminalId"
		| "fixSentAt"
	>
>;

function toState(row: Row): PrAutoFixState {
	return {
		workspaceId: row.workspaceId,
		pullRequestUrl: row.pullRequestUrl,
		prNumber: row.prNumber,
		status: row.status,
		pauseReason: row.pauseReason ?? null,
		attempts: row.attempts,
		lastHandledHeadSha: row.lastHandledHeadSha ?? null,
		agentTerminalId: row.agentTerminalId ?? null,
		fixSentAt: row.fixSentAt ?? null,
		updatedAt: row.updatedAt,
	};
}

/**
 * Watched PRs in host.db. Every write stamps a strictly newer `updatedAt`, and
 * `update` writes only while the row still carries the stamp the caller read,
 * so a poll that awaited GitHub cannot overwrite a toggle made meanwhile.
 */
export class PrAutoFixStore {
	private lastRevision: number;

	constructor(
		private readonly db: HostDb,
		private readonly now: () => number = Date.now,
	) {
		const latest = db
			.select({ value: max(pullRequestAutoFix.updatedAt) })
			.from(pullRequestAutoFix)
			.get();
		this.lastRevision = latest?.value ?? 0;
	}

	private nextUpdatedAt(): number {
		this.lastRevision = Math.max(this.now(), this.lastRevision + 1);
		return this.lastRevision;
	}

	list(): PrAutoFixState[] {
		return this.db.select().from(pullRequestAutoFix).all().map(toState);
	}

	get(workspaceId: string, pullRequestUrl: string): PrAutoFixState | null {
		const row = this.db
			.select()
			.from(pullRequestAutoFix)
			.where(
				and(
					eq(pullRequestAutoFix.workspaceId, workspaceId),
					eq(pullRequestAutoFix.pullRequestUrl, pullRequestUrl),
				),
			)
			.get();
		return row ? toState(row) : null;
	}

	findByUrl(pullRequestUrl: string): PrAutoFixState | null {
		const row = this.db
			.select()
			.from(pullRequestAutoFix)
			.where(eq(pullRequestAutoFix.pullRequestUrl, pullRequestUrl))
			.get();
		return row ? toState(row) : null;
	}

	findInWorkspace(
		workspaceId: string,
		prNumber: number,
	): PrAutoFixState | null {
		const row = this.db
			.select()
			.from(pullRequestAutoFix)
			.where(
				and(
					eq(pullRequestAutoFix.workspaceId, workspaceId),
					eq(pullRequestAutoFix.prNumber, prNumber),
				),
			)
			.get();
		return row ? toState(row) : null;
	}

	/** Starts watching, or resumes with a fresh attempt count. */
	watch(input: {
		workspaceId: string;
		pullRequestUrl: string;
		prNumber: number;
	}): PrAutoFixState {
		const at = this.nextUpdatedAt();
		const fresh = {
			status: "watching" as const,
			pauseReason: null,
			attempts: 0,
			lastHandledHeadSha: null,
			agentTerminalId: null,
			fixSentAt: null,
			updatedAt: at,
		};
		this.db
			.insert(pullRequestAutoFix)
			.values({ ...input, ...fresh, createdAt: at })
			.onConflictDoUpdate({
				target: [
					pullRequestAutoFix.workspaceId,
					pullRequestAutoFix.pullRequestUrl,
				],
				set: fresh,
			})
			.run();
		return { ...input, ...fresh };
	}

	update(previous: PrAutoFixState, patch: StatePatch): PrAutoFixState | null {
		const updatedAt = this.nextUpdatedAt();
		const result = this.db
			.update(pullRequestAutoFix)
			.set({ ...patch, updatedAt })
			.where(
				and(
					eq(pullRequestAutoFix.workspaceId, previous.workspaceId),
					eq(pullRequestAutoFix.pullRequestUrl, previous.pullRequestUrl),
					eq(pullRequestAutoFix.updatedAt, previous.updatedAt),
				),
			)
			.run();
		return result.changes > 0 ? { ...previous, ...patch, updatedAt } : null;
	}

	delete(workspaceId: string, pullRequestUrl: string): boolean {
		const result = this.db
			.delete(pullRequestAutoFix)
			.where(
				and(
					eq(pullRequestAutoFix.workspaceId, workspaceId),
					eq(pullRequestAutoFix.pullRequestUrl, pullRequestUrl),
				),
			)
			.run();
		return result.changes > 0;
	}
}

export interface WorkspacePullRequest {
	url: string;
	number: number;
	state: PrAutoFixPullRequest["state"];
}

function toAutoFixState(state: string | null): PrAutoFixPullRequest["state"] {
	const coerced = coercePullRequestState(state);
	return coerced === "closed" || coerced === "merged" ? coerced : "open";
}

/** A live workspace's checkout, or null once it is archived or gone. */
export function readLiveWorkspace(
	db: HostDb,
	workspaceId: string,
): { worktreePath: string } | null {
	return (
		db
			.select({ worktreePath: workspaces.worktreePath })
			.from(workspaces)
			.where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
			.get() ?? null
	);
}

/** The PR the workspace is linked to now, as the sidebar shows it. */
export function readWorkspacePullRequest(
	db: HostDb,
	workspaceId: string,
): WorkspacePullRequest | null {
	const row = db
		.select({
			url: pullRequests.url,
			number: pullRequests.prNumber,
			state: pullRequests.state,
		})
		.from(workspaces)
		.innerJoin(pullRequests, eq(workspaces.pullRequestId, pullRequests.id))
		.where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
		.get();
	return row ? { ...row, state: toAutoFixState(row.state) } : null;
}

/**
 * The host's last read of the PR. A renamed repository can leave a second
 * row under the old owner with the same URL, so the newest read wins. A row
 * nobody refreshed lately (its workspace moved to another branch) reports no
 * head, so the watcher waits rather than act on old checks.
 */
export function readPullRequestObservation(
	db: HostDb,
	pullRequestUrl: string,
	options: { now: number; staleAfterMs: number },
): PrAutoFixPullRequest | null {
	const row = db
		.select({
			state: pullRequests.state,
			headSha: pullRequests.headSha,
			headBranch: pullRequests.headBranch,
			checksJson: pullRequests.checksJson,
			lastFetchedAt: pullRequests.lastFetchedAt,
		})
		.from(pullRequests)
		.where(eq(pullRequests.url, pullRequestUrl))
		.orderBy(desc(pullRequests.lastFetchedAt))
		.limit(1)
		.get();
	if (!row) return null;
	const fresh =
		row.lastFetchedAt !== null &&
		options.now - row.lastFetchedAt <= options.staleAfterMs;
	return {
		state: toAutoFixState(row.state),
		headSha: fresh ? row.headSha : null,
		headBranch: row.headBranch,
		checks: parseChecksJson(row.checksJson),
	};
}
