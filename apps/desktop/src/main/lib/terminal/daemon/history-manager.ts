import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
} from "../../terminal-escape-filter";
import {
	HistoryReader,
	HistoryWriter,
	truncateUtf8ToLastBytes,
} from "../../terminal-history";
import { MAX_HISTORY_SCROLLBACK_BYTES } from "./constants";
import type { SessionInfo } from "./types";

type HistoryWriterParams = {
	paneId: string;
	workspaceId: string;
	cwd: string;
	cols: number;
	rows: number;
	initialScrollback?: string;
};

export class HistoryManager {
	private historyWriters = new Map<string, HistoryWriter>();
	private pendingHistoryData = new Map<string, string[]>();
	// A pane's writers share one meta.json and scrollback.bin, so its disk steps run in call order.
	private diskQueues = new Map<string, Promise<void>>();

	private queueDiskStep(
		paneId: string,
		step: () => Promise<void>,
	): Promise<void> {
		const next = (this.diskQueues.get(paneId) ?? Promise.resolve()).then(step);
		const settled = next.catch(() => {});
		this.diskQueues.set(paneId, settled);
		settled.then(() => {
			if (this.diskQueues.get(paneId) === settled) {
				this.diskQueues.delete(paneId);
			}
		});
		return next;
	}

	initHistoryWriter(params: HistoryWriterParams): Promise<void> {
		this.closeHistoryWriter(params.paneId);
		const pending: string[] = [];
		this.pendingHistoryData.set(params.paneId, pending);
		return this.queueDiskStep(params.paneId, () =>
			this.openHistoryWriter(params, pending),
		);
	}

	private async openHistoryWriter(
		{
			paneId,
			workspaceId,
			cwd,
			cols,
			rows,
			initialScrollback,
		}: HistoryWriterParams,
		pending: string[],
	): Promise<void> {
		let safeScrollback = initialScrollback;
		if (initialScrollback !== undefined) {
			if (typeof initialScrollback !== "string") {
				console.warn(
					`[HistoryManager] initialScrollback for ${paneId} is not a string, ignoring`,
				);
				safeScrollback = undefined;
			} else {
				const initialScrollbackBytes = Buffer.byteLength(
					initialScrollback,
					"utf8",
				);
				if (initialScrollbackBytes > MAX_HISTORY_SCROLLBACK_BYTES) {
					console.warn(
						`[HistoryManager] initialScrollback for ${paneId} too large (${initialScrollbackBytes} bytes), truncating to ${MAX_HISTORY_SCROLLBACK_BYTES}`,
					);
					safeScrollback = truncateUtf8ToLastBytes(
						initialScrollback,
						MAX_HISTORY_SCROLLBACK_BYTES,
					);
				}
			}
		}

		try {
			const writer = new HistoryWriter(workspaceId, paneId, cwd, cols, rows);
			await writer.init(safeScrollback);
			if (this.pendingHistoryData.get(paneId) !== pending) {
				await writer.close();
				return;
			}
			this.historyWriters.set(paneId, writer);
			this.pendingHistoryData.delete(paneId);
			for (const data of pending) {
				writer.write(data);
			}
		} catch (error) {
			console.error(
				`[HistoryManager] Failed to init history writer for ${paneId}:`,
				error,
			);
		} finally {
			if (this.pendingHistoryData.get(paneId) === pending) {
				this.pendingHistoryData.delete(paneId);
			}
		}
	}

	writeToHistory(
		paneId: string,
		data: string,
		getSession: () => SessionInfo | undefined,
	): void {
		const buffer = this.pendingHistoryData.get(paneId);
		if (buffer) {
			buffer.push(data);
			return;
		}

		const writer = this.historyWriters.get(paneId);
		if (!writer) {
			return;
		}

		if (containsClearScrollbackSequence(data)) {
			const session = getSession();
			if (session) {
				const contentAfterClear = extractContentAfterClear(data);
				this.initHistoryWriter({
					paneId,
					workspaceId: session.workspaceId,
					cwd: session.cwd,
					cols: session.cols,
					rows: session.rows,
					initialScrollback: contentAfterClear || undefined,
				}).catch((error) => {
					console.warn(
						`[HistoryManager] Failed to reinitialize history writer for ${paneId}:`,
						error,
					);
				});
			}
			return;
		}

		writer.write(data);
	}

	closeHistoryWriter(paneId: string, exitCode?: number): void {
		const writer = this.historyWriters.get(paneId);
		if (writer) {
			this.historyWriters.delete(paneId);
			this.queueDiskStep(paneId, () => writer.close(exitCode)).catch(
				(error) => {
					console.error(
						`[HistoryManager] Failed to close history writer for ${paneId}:`,
						error,
					);
				},
			);
		}

		this.pendingHistoryData.delete(paneId);
	}

	async cleanupHistory(paneId: string, workspaceId: string): Promise<void> {
		this.closeHistoryWriter(paneId);

		try {
			const reader = new HistoryReader(workspaceId, paneId);
			await this.queueDiskStep(paneId, () => reader.cleanup());
		} catch (error) {
			console.error(
				`[HistoryManager] Failed to cleanup history for ${paneId}:`,
				error,
			);
		}
	}

	isRecording(paneId: string): boolean {
		return (
			this.historyWriters.has(paneId) || this.pendingHistoryData.has(paneId)
		);
	}

	async resetAll(sessions: Map<string, SessionInfo>): Promise<void> {
		for (const paneId of [
			...this.historyWriters.keys(),
			...this.pendingHistoryData.keys(),
		]) {
			if (!sessions.get(paneId)?.isAlive) this.closeHistoryWriter(paneId);
		}
		for (const [paneId, session] of sessions) {
			if (!session.isAlive) continue;
			this.initHistoryWriter({
				paneId,
				workspaceId: session.workspaceId,
				cwd: session.cwd,
				cols: session.cols,
				rows: session.rows,
			}).catch((error) => {
				console.warn(
					`[HistoryManager] Failed to reinitialize history for ${paneId}:`,
					error,
				);
			});
		}
		await Promise.all(this.diskQueues.values());
	}

	async cleanup(): Promise<void> {
		this.closeAllSync();
		await Promise.all(this.diskQueues.values());
	}

	forceCloseAll(): Promise<void> {
		return this.cleanup();
	}

	closeAllSync(): void {
		for (const paneId of [...this.historyWriters.keys()]) {
			this.closeHistoryWriter(paneId);
		}
		this.pendingHistoryData.clear();
	}
}
