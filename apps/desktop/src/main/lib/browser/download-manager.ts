import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { downloads } from "@superset/local-db";
import { desc, eq, ne } from "drizzle-orm";
import { app, session, shell } from "electron";
import { APP_PARTITION, BROWSER_PARTITION } from "shared/constants";
import { localDb } from "../local-db";

const MAX_TRACKED_DOWNLOADS = 200;

/**
 * Tracks downloads started from the in-app browser pane and the app window.
 * One `will-download` listener per session feeds a single list, matching a
 * normal browser's one global downloads list.
 */
class DownloadManager extends EventEmitter {
	private activeItems = new Map<string, Electron.DownloadItem>();
	// Paths chosen for a download that's still in flight — `existsSync` alone
	// can't see these, since Electron doesn't create the file on disk until
	// the transfer actually starts writing, so two downloads picked close
	// together could otherwise resolve to (and overwrite) the same path.
	private reservedPaths = new Set<string>();
	private started = false;

	/** Chrome-style dedupe: "report.pdf" -> "report (1).pdf" -> "report (2).pdf". */
	private reserveSavePath(dir: string, filename: string): string {
		const ext = extname(filename);
		const base = basename(filename, ext);
		let candidate = join(dir, filename);
		for (
			let n = 1;
			existsSync(candidate) || this.reservedPaths.has(candidate);
			n++
		) {
			candidate = join(dir, `${base} (${n})${ext}`);
		}
		this.reservedPaths.add(candidate);
		return candidate;
	}

	start(): void {
		if (this.started) return;
		this.started = true;

		// A row left "progressing" from a previous run has no live DownloadItem
		// to resume — the app doesn't persist partial-download state across
		// restarts, so it can only ever be reported as interrupted.
		localDb
			.update(downloads)
			.set({ state: "interrupted" })
			.where(eq(downloads.state, "progressing"))
			.run();

		const downloadDir = app.getPath("downloads");
		const onWillDownload = (
			_event: Electron.Event,
			item: Electron.DownloadItem,
		): void => {
			const id = randomUUID();
			const savePath = this.reserveSavePath(downloadDir, item.getFilename());
			item.setSavePath(savePath);

			localDb
				.insert(downloads)
				.values({
					id,
					url: item.getURL(),
					filename: basename(savePath),
					savePath,
					mimeType: item.getMimeType() || null,
					totalBytes: item.getTotalBytes() || null,
					receivedBytes: 0,
					state: "progressing",
					startedAt: Date.now(),
				})
				.run();
			this.activeItems.set(id, item);
			this.emit("changed");

			item.on("updated", (_e, state) => {
				localDb
					.update(downloads)
					.set({
						receivedBytes: item.getReceivedBytes(),
						totalBytes: item.getTotalBytes() || null,
						state: state === "progressing" ? "progressing" : "interrupted",
					})
					.where(eq(downloads.id, id))
					.run();
				this.emit("changed");
			});

			item.once("done", (_e, state) => {
				this.activeItems.delete(id);
				this.reservedPaths.delete(savePath);
				localDb
					.update(downloads)
					.set({
						state,
						receivedBytes: item.getReceivedBytes(),
						completedAt: Date.now(),
					})
					.where(eq(downloads.id, id))
					.run();
				this.emit("changed");
			});
		};

		for (const partition of [APP_PARTITION, BROWSER_PARTITION]) {
			const ses = session.fromPartition(partition);
			ses.setDownloadPath(downloadDir);
			ses.on("will-download", onWillDownload);
		}
	}

	list() {
		return localDb
			.select()
			.from(downloads)
			.orderBy(desc(downloads.startedAt))
			.limit(MAX_TRACKED_DOWNLOADS)
			.all();
	}

	getById(id: string) {
		return localDb.select().from(downloads).where(eq(downloads.id, id)).get();
	}

	/** True if a live in-progress download was found and cancelled. */
	cancel(id: string): boolean {
		const item = this.activeItems.get(id);
		if (!item) return false;
		item.cancel();
		return true;
	}

	/** Clears finished entries; downloads still in flight are left alone. */
	clear(): void {
		localDb.delete(downloads).where(ne(downloads.state, "progressing")).run();
		this.emit("changed");
	}

	showInFolder(savePath: string): void {
		shell.showItemInFolder(savePath);
	}

	openFile(savePath: string): Promise<string> {
		return shell.openPath(savePath);
	}
}

export const downloadManager = new DownloadManager();
