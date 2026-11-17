import { computeChecksStatus } from "@superset/shared/pull-request-checks";
import type { TerminalAgentBinding } from "../terminal-agents/types.ts";
import { buildAutoFixPrompt } from "./buildPrompt.ts";
import { decideAutoFix, type PrAutoFixDecision } from "./decision.ts";
import type { PrAutoFixStore, WorkspacePullRequest } from "./store.ts";
import {
	PR_AUTO_FIX_MAX_ATTEMPTS,
	type PrAutoFixAgent,
	type PrAutoFixCheckout,
	type PrAutoFixPullRequest,
	type PrAutoFixState,
	type PrAutoFixStatus,
	type PrAutoFixWatch,
} from "./types.ts";

export const TICK_INTERVAL_MS = 15_000;
export const ACTIVE_POLL_MS = 30_000;
export const SETTLED_POLL_MS = 60_000;
export const IDLE_POLL_MS = 5 * 60_000;
export const IDLE_AFTER_MS = 30 * 60_000;
export const STALE_PULL_REQUEST_MS = 10 * 60_000;
export const MAX_WATCHES = 20;

const UNKNOWN_PULL_REQUEST: PrAutoFixPullRequest = {
	state: "open",
	headSha: null,
	headBranch: null,
	checks: [],
};

export interface PrAutoFixAgentTarget extends PrAutoFixAgent {
	terminalId: string;
	binding: TerminalAgentBinding;
}

export type PrAutoFixBlocker =
	| "not-linked"
	| "not-open"
	| "no-agent"
	| "other-workspace"
	| "limit";

export interface PrAutoFixDescription {
	workspaceId: string;
	watch: PrAutoFixWatch | null;
	maxAttempts: number;
	hasAgent: boolean;
	blocker: PrAutoFixBlocker | null;
}

export class PrAutoFixError extends Error {
	constructor(readonly blocker: PrAutoFixBlocker) {
		super(BLOCKER_MESSAGES[blocker]);
	}
}

const BLOCKER_MESSAGES: Record<PrAutoFixBlocker, string> = {
	"not-linked": "This workspace is not on that pull request",
	"not-open": "Only open pull requests can be auto-fixed",
	"no-agent": "No agent is running in this workspace",
	"other-workspace":
		"Auto-fix CI is already on for this pull request in another workspace",
	limit: `This host already watches ${MAX_WATCHES} pull requests`,
};

export interface PrAutoFixDeps {
	store: PrAutoFixStore;
	getWorkspace(workspaceId: string): { worktreePath: string } | null;
	getWorkspacePullRequest(workspaceId: string): WorkspacePullRequest | null;
	readPullRequest(input: {
		workspaceId: string;
		pullRequestUrl: string;
		fresh: boolean;
	}): Promise<PrAutoFixPullRequest | null>;
	readCheckout(
		worktreePath: string,
	): Promise<(PrAutoFixCheckout & { headSha: string | null }) | null>;
	listAgents(workspaceId: string): PrAutoFixAgentTarget[];
	sendToAgent(input: {
		workspaceId: string;
		terminalId: string;
		expectedAgent: TerminalAgentBinding;
		text: string;
		signal: AbortSignal;
		acquireDelivery: () => Promise<{ isValid: () => boolean } | null>;
	}): Promise<undefined | { inputStaged: true }>;
	notifyChanged(workspaceId: string): void;
	now?: () => number;
	setIntervalFn?: typeof setInterval;
	clearIntervalFn?: typeof clearInterval;
}

interface Slot {
	nextPollAt: number;
	signature: string | null;
	changedAt: number;
}

const keyOf = (state: Pick<PrAutoFixState, "workspaceId" | "pullRequestUrl">) =>
	`${state.workspaceId}\0${state.pullRequestUrl}`;

export function toWatch(state: PrAutoFixState): PrAutoFixWatch {
	return {
		workspaceId: state.workspaceId,
		pullRequestUrl: state.pullRequestUrl,
		prNumber: state.prNumber,
		status: state.status,
		pauseReason: state.pauseReason,
		attempts: state.attempts,
		maxAttempts: PR_AUTO_FIX_MAX_ATTEMPTS,
		lastHandledHeadSha: state.lastHandledHeadSha,
		updatedAt: state.updatedAt,
	};
}

export class PrAutoFixManager {
	private readonly slots = new Map<string, Slot>();
	private readonly pollingWorkspaces = new Set<string>();
	private readonly sends = new Map<string, AbortController>();
	private readonly now: () => number;
	private ticker: ReturnType<typeof setInterval> | null = null;
	private stopped = false;

	constructor(private readonly deps: PrAutoFixDeps) {
		this.now = deps.now ?? Date.now;
	}

	start(): void {
		const states = this.deps.store.list();
		for (const state of states) {
			if (state.status !== "fixing" || state.fixSentAt !== null) continue;
			if (
				this.deps.store.update(state, {
					status: "paused",
					pauseReason: "dispatch-interrupted",
				})
			)
				this.deps.notifyChanged(state.workspaceId);
		}
		if (states.length > 0) this.ensureTicking();
	}

	stop(): void {
		this.stopped = true;
		for (const abort of this.sends.values()) abort.abort();
		this.sends.clear();
		if (this.ticker) (this.deps.clearIntervalFn ?? clearInterval)(this.ticker);
		this.ticker = null;
	}

	list(workspaceId?: string): PrAutoFixWatch[] {
		return this.deps.store
			.list()
			.filter((state) => !workspaceId || state.workspaceId === workspaceId)
			.map(toWatch);
	}

	ownerOf(pullRequestUrls: string[]): string | null {
		for (const url of pullRequestUrls) {
			const state = this.deps.store.findByUrl(url);
			if (state) return state.workspaceId;
		}
		return null;
	}

	describe(workspaceId: string, prNumber: number): PrAutoFixDescription {
		const state = this.deps.store.findInWorkspace(workspaceId, prNumber);
		const hasAgent = this.deps.listAgents(workspaceId).length > 0;
		return {
			workspaceId,
			watch: state ? toWatch(state) : null,
			maxAttempts: PR_AUTO_FIX_MAX_ATTEMPTS,
			hasAgent,
			blocker: this.blocker(workspaceId, prNumber, hasAgent),
		};
	}

	set(input: {
		workspaceId: string;
		prNumber: number;
		enabled: boolean;
	}): PrAutoFixDescription {
		const { workspaceId, prNumber } = input;
		if (!input.enabled) {
			const state = this.deps.store.findInWorkspace(workspaceId, prNumber);
			if (state && this.deps.store.delete(workspaceId, state.pullRequestUrl)) {
				this.forget(state);
				this.deps.notifyChanged(workspaceId);
			}
			return this.describe(workspaceId, prNumber);
		}
		if (this.stopped) throw new Error("Auto-fix CI has stopped on this host");
		const hasAgent = this.deps.listAgents(workspaceId).length > 0;
		const blocker = this.blocker(workspaceId, prNumber, hasAgent);
		const pullRequest = this.deps.getWorkspacePullRequest(workspaceId);
		if (blocker || !pullRequest)
			throw new PrAutoFixError(blocker ?? "not-linked");
		const state = this.deps.store.watch({
			workspaceId,
			pullRequestUrl: pullRequest.url,
			prNumber,
		});
		this.forget(state);
		this.slots.set(keyOf(state), {
			nextPollAt: 0,
			signature: null,
			changedAt: this.now(),
		});
		this.ensureTicking();
		this.deps.notifyChanged(workspaceId);
		return this.describe(workspaceId, prNumber);
	}

	private blocker(
		workspaceId: string,
		prNumber: number,
		hasAgent: boolean,
	): PrAutoFixBlocker | null {
		const pullRequest = this.deps.getWorkspacePullRequest(workspaceId);
		if (!pullRequest || pullRequest.number !== prNumber) return "not-linked";
		if (pullRequest.state !== "open") return "not-open";
		if (!hasAgent) return "no-agent";
		const owner = this.deps.store.findByUrl(pullRequest.url);
		if (owner && owner.workspaceId !== workspaceId) return "other-workspace";
		if (!owner && this.deps.store.list().length >= MAX_WATCHES) return "limit";
		return null;
	}

	async tick(): Promise<void> {
		const states = this.deps.store.list();
		const live = new Set(states.map(keyOf));
		for (const key of this.slots.keys())
			if (!live.has(key)) this.slots.delete(key);
		const byWorkspace = new Map<string, PrAutoFixState[]>();
		for (const state of states) {
			const group = byWorkspace.get(state.workspaceId);
			if (group) group.push(state);
			else byWorkspace.set(state.workspaceId, [state]);
		}
		await Promise.all(
			[...byWorkspace].map(([workspaceId, group]) =>
				this.pollWorkspace(workspaceId, group),
			),
		);
		if (states.length === 0) this.stopTicking();
	}

	/** One fix per workspace: once one starts, its siblings wait for the agent. */
	private async pollWorkspace(
		workspaceId: string,
		group: PrAutoFixState[],
	): Promise<void> {
		if (this.pollingWorkspaces.has(workspaceId)) return;
		this.pollingWorkspaces.add(workspaceId);
		try {
			for (const state of group) {
				const slot = this.slotFor(state);
				if (slot.nextPollAt > this.now()) continue;
				try {
					if (await this.poll(state, slot)) return;
				} catch (error) {
					slot.nextPollAt = this.now() + ACTIVE_POLL_MS;
					console.warn("[pr-auto-fix] poll failed", {
						pullRequestUrl: state.pullRequestUrl,
						error,
					});
				}
			}
		} finally {
			this.pollingWorkspaces.delete(workspaceId);
		}
	}

	private async poll(state: PrAutoFixState, slot: Slot): Promise<boolean> {
		const workspace = this.deps.getWorkspace(state.workspaceId);
		if (
			workspace &&
			state.status !== "paused" &&
			this.resolveAgent(state)?.busy
		) {
			slot.nextPollAt = this.now() + ACTIVE_POLL_MS;
			return false;
		}
		const pullRequest = workspace
			? await this.deps.readPullRequest({
					workspaceId: state.workspaceId,
					pullRequestUrl: state.pullRequestUrl,
					fresh: state.status === "fixing",
				})
			: null;
		const checkout =
			workspace && state.status !== "paused"
				? await this.deps.readCheckout(workspace.worktreePath)
				: null;

		const current = this.deps.store.get(
			state.workspaceId,
			state.pullRequestUrl,
		);
		if (!current || current.updatedAt !== state.updatedAt) return false;
		const agent = this.resolveAgent(current);
		const decision = decideAutoFix({
			state: current,
			workspaceAvailable: this.deps.getWorkspace(state.workspaceId) !== null,
			agent,
			checkout,
			pullRequest: pullRequest ?? UNKNOWN_PULL_REQUEST,
			now: this.now(),
		});
		this.reschedule(slot, current, pullRequest, decision);
		return this.apply(current, decision, agent, checkout);
	}

	private async apply(
		current: PrAutoFixState,
		decision: PrAutoFixDecision,
		agent: PrAutoFixAgentTarget | null,
		checkout: { headSha: string | null } | null,
	): Promise<boolean> {
		const { store } = this.deps;
		switch (decision.type) {
			case "wait":
				return false;
			case "disable":
				if (store.delete(current.workspaceId, current.pullRequestUrl)) {
					this.forget(current);
					this.deps.notifyChanged(current.workspaceId);
				}
				return false;
			case "pause":
				if (
					store.update(current, {
						status: "paused",
						pauseReason: decision.reason,
					})
				)
					this.deps.notifyChanged(current.workspaceId);
				return false;
			case "update":
				if (
					store.update(current, {
						status: "watching",
						pauseReason: null,
						attempts: decision.attempts,
					})
				)
					this.deps.notifyChanged(current.workspaceId);
				return false;
			case "fix":
				if (!agent) return false;
				return this.dispatch(
					current,
					decision,
					agent,
					checkout?.headSha ?? null,
				);
		}
	}

	/**
	 * Records the attempt before sending, so a send cut short by a crash or an
	 * unclear outcome pauses as `dispatch-interrupted` instead of resending.
	 */
	private async dispatch(
		current: PrAutoFixState,
		decision: Extract<PrAutoFixDecision, { type: "fix" }>,
		agent: PrAutoFixAgentTarget,
		returnHeadSha: string | null,
	): Promise<boolean> {
		const { store } = this.deps;
		const fixing = store.update(current, {
			status: "fixing",
			pauseReason: null,
			attempts: decision.attempt,
			lastHandledHeadSha: decision.headSha,
			agentTerminalId: agent.terminalId,
			fixSentAt: null,
		});
		if (!fixing) return false;
		this.deps.notifyChanged(current.workspaceId);

		const key = keyOf(fixing);
		const abort = new AbortController();
		this.sends.set(key, abort);
		const isCurrent = () =>
			!abort.signal.aborted &&
			store.get(fixing.workspaceId, fixing.pullRequestUrl)?.updatedAt ===
				fixing.updatedAt;
		let declined = false;
		const sentAt = this.now();
		try {
			const outcome = await this.deps.sendToAgent({
				workspaceId: fixing.workspaceId,
				terminalId: agent.terminalId,
				expectedAgent: agent.binding,
				text: buildAutoFixPrompt({
					prNumber: fixing.prNumber,
					pullRequestUrl: fixing.pullRequestUrl,
					headSha: decision.headSha,
					switchBranch: decision.switchBranch,
					returnHeadSha,
				}),
				signal: abort.signal,
				acquireDelivery: async () => {
					if (!isCurrent() || this.resolveAgent(fixing)?.busy !== false) {
						declined = true;
						return null;
					}
					return { isValid: isCurrent };
				},
			});
			if (outcome?.inputStaged) {
				this.pauseInterrupted(fixing);
				return false;
			}
			if (store.update(fixing, { fixSentAt: sentAt }))
				this.deps.notifyChanged(fixing.workspaceId);
			return true;
		} catch (error) {
			if (declined) {
				if (
					store.update(fixing, {
						status: current.status,
						pauseReason: current.pauseReason,
						attempts: current.attempts,
						lastHandledHeadSha: current.lastHandledHeadSha,
						agentTerminalId: current.agentTerminalId,
						fixSentAt: current.fixSentAt,
					})
				)
					this.deps.notifyChanged(fixing.workspaceId);
				return false;
			}
			console.warn("[pr-auto-fix] fix prompt failed", {
				pullRequestUrl: fixing.pullRequestUrl,
				error,
			});
			this.pauseInterrupted(fixing);
			return false;
		} finally {
			if (this.sends.get(key) === abort) this.sends.delete(key);
		}
	}

	private pauseInterrupted(fixing: PrAutoFixState): void {
		if (
			this.deps.store.update(fixing, {
				status: "paused",
				pauseReason: "dispatch-interrupted",
			})
		)
			this.deps.notifyChanged(fixing.workspaceId);
	}

	private resolveAgent(state: PrAutoFixState): PrAutoFixAgentTarget | null {
		const agents = this.deps.listAgents(state.workspaceId);
		if (state.status === "fixing") {
			return (
				agents.find((agent) => agent.terminalId === state.agentTerminalId) ??
				null
			);
		}
		let latest: PrAutoFixAgentTarget | null = null;
		for (const agent of agents) {
			if (!latest || agent.lastEventAt > latest.lastEventAt) latest = agent;
		}
		return latest;
	}

	private reschedule(
		slot: Slot,
		state: PrAutoFixState,
		pullRequest: PrAutoFixPullRequest | null,
		decision: PrAutoFixDecision,
	): void {
		const now = this.now();
		const checksStatus = computeChecksStatus([...(pullRequest?.checks ?? [])]);
		const signature = `${state.status}:${pullRequest?.headSha}:${checksStatus}`;
		if (signature !== slot.signature) {
			slot.signature = signature;
			slot.changedAt = now;
		}
		const next: PrAutoFixStatus =
			decision.type === "fix"
				? "fixing"
				: decision.type === "pause"
					? "paused"
					: decision.type === "update"
						? "watching"
						: state.status;
		const interval =
			next === "paused"
				? IDLE_POLL_MS
				: next === "fixing" ||
						checksStatus === "pending" ||
						checksStatus === "none"
					? ACTIVE_POLL_MS
					: now - slot.changedAt >= IDLE_AFTER_MS
						? IDLE_POLL_MS
						: SETTLED_POLL_MS;
		slot.nextPollAt = now + interval;
	}

	private slotFor(state: PrAutoFixState): Slot {
		const key = keyOf(state);
		let slot = this.slots.get(key);
		if (!slot) {
			slot = { nextPollAt: 0, signature: null, changedAt: this.now() };
			this.slots.set(key, slot);
		}
		return slot;
	}

	private forget(state: PrAutoFixState): void {
		const key = keyOf(state);
		this.slots.delete(key);
		this.sends.get(key)?.abort();
		this.sends.delete(key);
	}

	private ensureTicking(): void {
		if (this.ticker || this.stopped) return;
		this.ticker = (this.deps.setIntervalFn ?? setInterval)(() => {
			void this.tick();
		}, TICK_INTERVAL_MS);
		this.ticker.unref?.();
	}

	private stopTicking(): void {
		if (!this.ticker) return;
		(this.deps.clearIntervalFn ?? clearInterval)(this.ticker);
		this.ticker = null;
	}
}
