import {
	MoveBook,
	type MoveBookRequest,
	type MoveBookResponse,
} from "@superset/shared/move-book";
import { Server } from "partyserver";
import type { RealtimeEnv } from "./types";

/**
 * One object per organization: its workspace moves and their chat moves. The
 * API runs each move and records every step here; an alarm fails the moves
 * that stopped answering, so a stuck move frees its workspace on time.
 */
export class MoveHub extends Server<RealtimeEnv> {
	private book: MoveBook | null = null;

	async apply(request: MoveBookRequest): Promise<MoveBookResponse> {
		const response = this.moveBook().apply(request);
		await this.scheduleSweep();
		return response;
	}

	async onAlarm(): Promise<void> {
		this.moveBook().sweep();
		await this.scheduleSweep();
	}

	private async scheduleSweep(): Promise<void> {
		const at = this.moveBook().nextStaleAt();
		if (at === null) {
			await this.ctx.storage.deleteAlarm();
			return;
		}
		const due = at + 1;
		if ((await this.ctx.storage.getAlarm()) !== due) {
			await this.ctx.storage.setAlarm(due);
		}
	}

	private moveBook(): MoveBook {
		this.book ??= new MoveBook(
			this.ctx.storage.sql,
			(fn) => this.ctx.storage.transactionSync(fn),
			this.name,
		);
		return this.book;
	}
}
