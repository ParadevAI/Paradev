import { eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { workspaceMoveUndos } from "../../db/schema";

export const MOVE_UNDO_INTERVAL_MS = 60_000;
/** Longer than the desktop keeps handing terminals to a box that is still starting. */
export const HANDOFF_GRACE_MS = 15 * 60_000;
/** A terminal stopped for a move can be started again for an hour; past this it is too late to try. */
const GIVE_UP_MS = 55 * 60_000;

export type MoveStatus = {
	status: "pending" | "moving" | "ready" | "partial" | "failed";
	hasDestination: boolean;
	finishedAt: number | null;
};

const IN_FLIGHT: ReadonlySet<MoveStatus["status"]> = new Set([
	"pending",
	"moving",
]);

export function recordMoveUndo(
	db: HostDb,
	undo: {
		workspaceMoveId: string;
		workspaceId: string;
		stoppedTerminalIds: string[];
		followedChatIds: string[];
		now: number;
	},
): void {
	if (
		undo.stoppedTerminalIds.length === 0 &&
		undo.followedChatIds.length === 0
	) {
		return;
	}
	db.insert(workspaceMoveUndos)
		.values({
			workspaceMoveId: undo.workspaceMoveId,
			workspaceId: undo.workspaceId,
			stoppedTerminalIds: undo.stoppedTerminalIds,
			handingOffTerminalIds: [],
			followedChatIds: undo.followedChatIds,
			createdAt: undo.now,
		})
		.onConflictDoNothing()
		.run();
}

export function markHandingOff(
	db: HostDb,
	workspaceMoveId: string,
	terminalId: string,
): void {
	const row = db
		.select()
		.from(workspaceMoveUndos)
		.where(eq(workspaceMoveUndos.workspaceMoveId, workspaceMoveId))
		.get();
	if (!row || row.handingOffTerminalIds.includes(terminalId)) return;
	db.update(workspaceMoveUndos)
		.set({ handingOffTerminalIds: [...row.handingOffTerminalIds, terminalId] })
		.where(eq(workspaceMoveUndos.workspaceMoveId, workspaceMoveId))
		.run();
}

/** Drops terminals and chats the desktop already put back, so they are not put back twice. */
export function dropUndone(
	db: HostDb,
	undone: { workspaceId?: string; terminalIds?: string[]; chatIds?: string[] },
): void {
	const terminals = new Set(undone.terminalIds ?? []);
	const chats = new Set(undone.chatIds ?? []);
	const rows = db.select().from(workspaceMoveUndos).all();
	for (const row of rows) {
		const sameWorkspace =
			!undone.workspaceId || row.workspaceId === undone.workspaceId;
		const stoppedTerminalIds = sameWorkspace
			? row.stoppedTerminalIds.filter((id) => !terminals.has(id))
			: row.stoppedTerminalIds;
		const followedChatIds = row.followedChatIds.filter((id) => !chats.has(id));
		if (
			stoppedTerminalIds.length === row.stoppedTerminalIds.length &&
			followedChatIds.length === row.followedChatIds.length
		) {
			continue;
		}
		db.update(workspaceMoveUndos)
			.set({ stoppedTerminalIds, followedChatIds })
			.where(eq(workspaceMoveUndos.workspaceMoveId, row.workspaceMoveId))
			.run();
	}
}

/**
 * Undoes what each recorded move left stopped here once the move is over:
 * its terminals start again, except those handed to the destination, and
 * its chats stop being followed. A move whose status cannot be read is
 * left alone, since starting a terminal that did move would run its agent
 * in two places.
 */
export async function undoEndedMoves(deps: {
	db: HostDb;
	statusOf: (workspaceMoveId: string) => Promise<MoveStatus | null>;
	resumeTerminals: (
		workspaceId: string,
		terminalIds: string[],
	) => Promise<{ failed: string[] }>;
	forgetChats: (chatIds: string[]) => void;
	now: number;
}): Promise<void> {
	const rows = deps.db.select().from(workspaceMoveUndos).all();
	for (const row of rows) {
		const remove = () =>
			deps.db
				.delete(workspaceMoveUndos)
				.where(eq(workspaceMoveUndos.workspaceMoveId, row.workspaceMoveId))
				.run();
		if (deps.now - row.createdAt > GIVE_UP_MS) {
			console.warn(
				`[teleport] gave up undoing move ${row.workspaceMoveId}; its terminals can no longer start again`,
			);
			remove();
			continue;
		}
		const move = await deps
			.statusOf(row.workspaceMoveId)
			.catch((error: unknown) => {
				console.warn(
					`[teleport] could not read move ${row.workspaceMoveId}`,
					error,
				);
				return null;
			});
		if (!move || IN_FLIGHT.has(move.status)) continue;
		const endedAt = move.finishedAt ?? row.createdAt;
		if (move.hasDestination && deps.now - endedAt < HANDOFF_GRACE_MS) continue;
		const handingOff = new Set(row.handingOffTerminalIds);
		const toResume = row.stoppedTerminalIds.filter((id) => !handingOff.has(id));
		const { failed } =
			toResume.length > 0
				? await deps.resumeTerminals(row.workspaceId, toResume)
				: { failed: [] };
		deps.forgetChats(row.followedChatIds);
		if (failed.length > 0) {
			deps.db
				.update(workspaceMoveUndos)
				.set({ stoppedTerminalIds: failed, followedChatIds: [] })
				.where(eq(workspaceMoveUndos.workspaceMoveId, row.workspaceMoveId))
				.run();
			continue;
		}
		remove();
	}
}
