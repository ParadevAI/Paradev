import {
	type ActiveAgentStatus,
	agentStatusFromEvent,
	highestAgentStatus,
} from "@superset/shared/agent-status";
import type { TerminalAgentStore } from "../../terminal-agents/store";

export interface SandboxAgentStatusTiming {
	settleMs: number;
	minIntervalMs: number;
	/** The API extends the session on each `working` report, so a long turn is re-sent at this interval. */
	workingHeartbeatMs: number;
	retryBaseMs: number;
	retryMaxMs: number;
}

const DEFAULT_TIMING: SandboxAgentStatusTiming = {
	settleMs: 2_000,
	minIntervalMs: 5_000,
	workingHeartbeatMs: 15 * 60_000,
	retryBaseMs: 5_000,
	retryMaxMs: 5 * 60_000,
};

// A box is one workspace, so every binding on it counts.
export function startSandboxAgentStatusReporter(args: {
	apiUrl: string;
	workspaceId: string;
	hostSecret: string;
	store: Pick<TerminalAgentStore, "list" | "on" | "off">;
	timing?: Partial<SandboxAgentStatusTiming>;
}): () => void {
	const timing = { ...DEFAULT_TIMING, ...args.timing };
	let reported: { status: ActiveAgentStatus | null; at: number } | undefined;
	let delivered = false;
	let lastDelivered: ActiveAgentStatus | null | undefined;
	let sentAt = 0;
	let failures = 0;
	let inFlight = false;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let timerDue = 0;

	const current = (): ActiveAgentStatus | null =>
		highestAgentStatus(
			args.store
				.list()
				.map((binding) => agentStatusFromEvent(binding.lastEventType)),
		);

	const nextWait = (): number | null => {
		if (inFlight) return null;
		const sinceSent = Date.now() - sentAt;
		const status = current();
		if (reported?.status !== status || !delivered) {
			const backoff =
				failures > 0
					? Math.min(
							timing.retryMaxMs,
							timing.retryBaseMs * 2 ** (failures - 1),
						)
					: 0;
			return Math.max(
				timing.settleMs,
				timing.minIntervalMs - sinceSent,
				backoff - sinceSent,
			);
		}
		if (status === "working") {
			return Math.max(0, timing.workingHeartbeatMs - sinceSent);
		}
		return null;
	};

	const schedule = () => {
		if (stopped) return;
		const wait = nextWait();
		if (wait === null) return;
		const due = Date.now() + wait;
		if (timer) {
			if (timerDue <= due) return;
			clearTimeout(timer);
		}
		timerDue = due;
		timer = setTimeout(() => void send(), wait);
	};

	const send = async () => {
		timer = null;
		if (inFlight) return;
		const status = current();
		if (reported?.status !== status) {
			reported = { status, at: Date.now() };
			delivered = false;
		}
		const heartbeatDue =
			status === "working" && Date.now() - sentAt >= timing.workingHeartbeatMs;
		if (delivered && !heartbeatDue) {
			schedule();
			return;
		}
		inFlight = true;
		sentAt = Date.now();
		try {
			const response = await fetch(
				`${args.apiUrl}/api/cloud-workspaces/${args.workspaceId}/agent-status`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${args.hostSecret}`,
						"content-type": "application/json",
					},
					body: JSON.stringify(reported),
					signal: AbortSignal.timeout(10_000),
				},
			);
			if (!response.ok) throw new Error(`answered ${response.status}`);
			if (lastDelivered !== status) {
				console.info(
					`[sandbox-agent-status] reported ${lastDelivered === undefined ? "unreported" : (lastDelivered ?? "none")} -> ${status ?? "none"}`,
				);
				lastDelivered = status;
			}
			delivered = true;
			failures = 0;
		} catch (error) {
			console.warn(
				"[sandbox-agent-status] report failed:",
				error instanceof Error ? error.message : error,
			);
			delivered = false;
			failures += 1;
		} finally {
			inFlight = false;
			schedule();
		}
	};

	args.store.on("change", schedule);
	schedule();
	return () => {
		stopped = true;
		args.store.off("change", schedule);
		if (timer) clearTimeout(timer);
	};
}
