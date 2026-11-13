import {
	BOX_PRESSURE_HEARTBEAT_MS,
	type BoxPressure,
} from "@superset/shared/box-pressure";
import type { BoxResources } from "../box-resources";
import { type BoxPressureState, nextBoxPressure } from "./box-pressure-level";

const SAMPLE_MS = 5_000;
const RETRY_MIN_MS = 30_000;
const RETRY_MAX_MS = 10 * 60_000;

function sameReport(a: BoxPressure | null, b: BoxPressure | null): boolean {
	if (!a || !b) return !a && !b;
	return (
		a.level === b.level &&
		a.limitedBy.join() === b.limitedBy.join() &&
		a.reap?.at === b.reap?.at
	);
}

/**
 * Samples the box every few seconds and tells the API when its pressure
 * changes. While under pressure it re-reports on a heartbeat, so the hub can
 * drop a box that stopped without saying so.
 */
export function startSandboxBoxPressureReporter(args: {
	apiUrl: string;
	workspaceId: string;
	hostSecret: string;
	read: () => BoxResources | null;
	sampleMs?: number;
	now?: () => number;
	post?: typeof fetch;
}): () => void {
	const now = args.now ?? Date.now;
	const post = args.post ?? fetch;
	let state: BoxPressureState = { pressure: null, since: now() };
	// Null until the first report lands, so a restarted host-service clears
	// whatever the hub still holds from before.
	let sent: { pressure: BoxPressure | null; at: number } | null = null;
	let inFlight = false;
	let retryAt = 0;
	let retryDelay = RETRY_MIN_MS;

	const report = async (pressure: BoxPressure | null) => {
		inFlight = true;
		try {
			const response = await post(
				`${args.apiUrl}/api/cloud-workspaces/${args.workspaceId}/box-pressure`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${args.hostSecret}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ pressure }),
					signal: AbortSignal.timeout(10_000),
				},
			);
			if (!response.ok) throw new Error(`answered ${response.status}`);
			sent = { pressure, at: now() };
			retryDelay = RETRY_MIN_MS;
		} catch (error) {
			console.warn(
				"[sandbox-box-pressure] report failed:",
				error instanceof Error ? error.message : error,
			);
			sent = null;
			// An API that predates the route answers 404 to every box; back off.
			retryAt = now() + retryDelay;
			retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
		} finally {
			inFlight = false;
		}
	};

	const tick = () => {
		if (inFlight || now() < retryAt) return;
		const sample = args.read();
		if (!sample) return;
		const at = now();
		state = nextBoxPressure(state, sample, at);
		const due =
			sent === null ||
			!sameReport(sent.pressure, state.pressure) ||
			(state.pressure !== null && at - sent.at >= BOX_PRESSURE_HEARTBEAT_MS);
		if (due) void report(state.pressure);
	};

	const timer = setInterval(tick, args.sampleMs ?? SAMPLE_MS);
	timer.unref?.();
	return () => clearInterval(timer);
}
