import type {
	PagePresenceViewer,
	PresenceVisitor,
} from "@superset/shared/page-presence";

export const SWEEP_MS = 30_000;
export const SILENT_MS = 75_000;

interface SweptSocket {
	connection: { close(code: number, reason: string): void };
	connectedAt: number | undefined;
}

/** Closes sockets that stopped answering pings, and reports how many are left. */
export function sweepSilent(
	sockets: Iterable<SweptSocket & { heardAt: Date | null }>,
	now: number,
): { evicted: boolean; remaining: number } {
	let remaining = 0;
	let evicted = false;
	for (const { connection, connectedAt, heardAt } of sockets) {
		const lastHeard = heardAt?.getTime() ?? connectedAt;
		if (lastHeard && now - lastHeard > SILENT_MS) {
			try {
				connection.close(4408, "silent");
			} catch {}
			evicted = true;
			continue;
		}
		remaining++;
	}
	return { evicted, remaining };
}

export async function scheduleSweep(
	storage: Pick<DurableObjectStorage, "getAlarm" | "setAlarm">,
	now: number,
): Promise<void> {
	if ((await storage.getAlarm()) === null) {
		await storage.setAlarm(now + SWEEP_MS);
	}
}

export interface PresentViewer {
	userId: string;
	viewer: PagePresenceViewer;
}

export interface PresenceReceiver {
	connection: { send(message: string): void };
	userId: string;
	seesVisitors: boolean;
}

export interface PresenceMessage {
	type: "presence";
	viewers: PagePresenceViewer[];
	visitors?: PresenceVisitor[];
}

/** What one receiver is told: everyone else here, and who has visited if they may see it. */
export function presenceMessage(
	receiver: Pick<PresenceReceiver, "userId" | "seesVisitors">,
	present: readonly PresentViewer[],
	visits: readonly Omit<PresenceVisitor, "active">[],
): PresenceMessage {
	const viewers = present
		.filter((other) => other.userId !== receiver.userId)
		.map((other) => other.viewer);
	if (!receiver.seesVisitors) return { type: "presence", viewers };
	const here = new Set(present.map((other) => other.userId));
	return {
		type: "presence",
		viewers,
		visitors: visits.map((visit) => ({
			...visit,
			active: here.has(visit.userId),
		})),
	};
}

export function broadcastPresence(
	receivers: Iterable<PresenceReceiver>,
	present: readonly PresentViewer[],
	visits: readonly Omit<PresenceVisitor, "active">[],
): void {
	for (const receiver of receivers) {
		try {
			receiver.connection.send(
				JSON.stringify(presenceMessage(receiver, present, visits)),
			);
		} catch {}
	}
}
