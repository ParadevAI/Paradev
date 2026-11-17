import type { TerminalAgentStore } from "../../terminal-agents/store";

export interface SandboxKeepaliveTiming {
	/** The box stops between one session timeout and this much longer after its agent's last activity. */
	intervalMs: number;
	retryBaseMs: number;
}

const DEFAULT_TIMING: SandboxKeepaliveTiming = {
	intervalMs: 15 * 60_000,
	retryBaseMs: 30_000,
};

function httpStatus(error: unknown): number | undefined {
	return (error as { data?: { httpStatus?: number } } | null)?.data?.httpStatus;
}

/**
 * Asks the API for more session time while the box's agents are active. The
 * API tops the session up to a full timeout, so the box stops a timeout after
 * the last activity, whether or not anyone has the workspace open.
 */
export function startSandboxKeepalive(args: {
	keepalive: () => Promise<unknown>;
	store: Pick<TerminalAgentStore, "on" | "off">;
	timing?: Partial<SandboxKeepaliveTiming>;
}): () => void {
	const timing = { ...DEFAULT_TIMING, ...args.timing };
	let nextAt = 0;
	let failures = 0;
	let active = false;
	let inFlight = false;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const schedule = () => {
		if (timer || inFlight || !active || stopped) return;
		timer = setTimeout(() => void ping(), Math.max(0, nextAt - Date.now()));
		timer.unref?.();
	};

	const ping = async () => {
		timer = null;
		active = false;
		inFlight = true;
		try {
			await args.keepalive();
			failures = 0;
			nextAt = Date.now() + timing.intervalMs;
		} catch (error) {
			const status = httpStatus(error);
			console.warn(
				"[sandbox-keepalive] failed:",
				error instanceof Error ? error.message : error,
			);
			// A refusal will not change on retry; the next activity asks again.
			if (status !== undefined && status < 500) {
				failures = 0;
				nextAt = Date.now() + timing.intervalMs;
			} else {
				active = true;
				failures += 1;
				const backoff = Math.min(
					timing.intervalMs,
					timing.retryBaseMs * 2 ** (failures - 1),
				);
				nextAt = Date.now() + backoff * (0.5 + Math.random() / 2);
			}
		} finally {
			inFlight = false;
			schedule();
		}
	};

	const onActivity = () => {
		active = true;
		schedule();
	};

	args.store.on("activity", onActivity);
	return () => {
		stopped = true;
		args.store.off("activity", onActivity);
		if (timer) clearTimeout(timer);
	};
}
