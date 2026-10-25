import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { screenshots } from "@superset/local-db";
import { desc, eq, isNull } from "drizzle-orm";
import { app, shell } from "electron";
import { localDb } from "../local-db";

const MAX_LISTED_SCREENSHOTS = 200;
const MAX_LISTED_DEVICE_SCREENSHOTS = 20;
const THUMBNAIL_WIDTH = 200;

function screenshotsDir(): string {
	const dir = join(app.getPath("pictures"), "Superset Screenshots");
	mkdirSync(dir, { recursive: true });
	return dir;
}

/** Chrome-style timestamped filename, e.g. "Screenshot 2026-08-26 at 14.05.32.png". */
function timestampedName(prefix: string): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${prefix} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} at ${pad(
		now.getHours(),
	)}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
}

function uniquePngPath(dir: string, name: string): string {
	let filename = `${name}.png`;
	for (let n = 2; existsSync(join(dir, filename)); n++) {
		filename = `${name} (${n}).png`;
	}
	return join(dir, filename);
}

export type ScreenshotSource =
	| { url: string }
	| { deviceKey: string; deviceName: string };

/**
 * Persists captures from the browser pane and from mobile devices. The
 * capture itself (and its clipboard copy) stays with the caller; this is
 * just where a capture ends up once someone wants to see it again.
 */
class ScreenshotManager extends EventEmitter {
	save(image: Electron.NativeImage, source: ScreenshotSource) {
		const prefix =
			"deviceKey" in source
				? source.deviceName.replace(/[/\\:]/g, "-")
				: "Screenshot";
		const savePath = uniquePngPath(screenshotsDir(), timestampedName(prefix));
		const filename = basename(savePath);
		const pngBuffer = image.toPNG();
		writeFileSync(savePath, pngBuffer);

		const { width, height } = image.getSize();
		// A downscaled copy stored alongside the row means the gallery can
		// render a grid of real previews without reading every file on disk.
		const thumbnail = image.resize({ width: THUMBNAIL_WIDTH }).toDataURL();
		const id = randomUUID();

		localDb
			.insert(screenshots)
			.values({
				id,
				url: "url" in source ? source.url : null,
				deviceKey: "deviceKey" in source ? source.deviceKey : null,
				filename,
				savePath,
				width,
				height,
				thumbnail,
				capturedAt: Date.now(),
			})
			.run();
		this.emit("changed");

		return { id, savePath, base64: pngBuffer.toString("base64") };
	}

	/** Browser captures; device captures are listed per device. */
	list() {
		return localDb
			.select()
			.from(screenshots)
			.where(isNull(screenshots.deviceKey))
			.orderBy(desc(screenshots.capturedAt))
			.limit(MAX_LISTED_SCREENSHOTS)
			.all();
	}

	listForDevice(deviceKey: string) {
		return localDb
			.select()
			.from(screenshots)
			.where(eq(screenshots.deviceKey, deviceKey))
			.orderBy(desc(screenshots.capturedAt))
			.limit(MAX_LISTED_DEVICE_SCREENSHOTS)
			.all();
	}

	getById(id: string) {
		return localDb
			.select()
			.from(screenshots)
			.where(eq(screenshots.id, id))
			.get();
	}

	/** Clears tracked browser rows; the PNGs stay on disk, same as clearing a downloads list. */
	clear(): void {
		localDb.delete(screenshots).where(isNull(screenshots.deviceKey)).run();
		this.emit("changed");
	}

	showInFolder(savePath: string): void {
		shell.showItemInFolder(savePath);
	}

	openFile(savePath: string): Promise<string> {
		return shell.openPath(savePath);
	}
}

export const screenshotManager = new ScreenshotManager();
