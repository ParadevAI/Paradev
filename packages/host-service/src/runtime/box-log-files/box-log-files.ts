import { open } from "node:fs/promises";
import { join } from "node:path";
import { SANDBOX_PATHS } from "@superset/shared/sandbox/contract";

/** The only files whose lines leave the box. The checkout and start hook logs hold customer output and are never read. */
export const BOX_LOG_FILES = [
	{ source: "boot", path: join(SANDBOX_PATHS.logs, "boot.log") },
	{ source: "memguard", path: join(SANDBOX_PATHS.logs, "memguard.log") },
	{ source: "desktop", path: join(SANDBOX_PATHS.logs, "desktop.log") },
] as const;

export type BoxLogSource = (typeof BOX_LOG_FILES)[number]["source"];

const POLL_MS = 2_000;
const LINE_AT = /^(\d{13}) /;

async function readFrom(path: string, offset: number): Promise<Buffer> {
	const file = await open(path, "r").catch(() => null);
	if (!file) return Buffer.alloc(0);
	try {
		const { size } = await file.stat();
		if (size <= offset) return Buffer.alloc(0);
		const buffer = Buffer.alloc(size - offset);
		await file.read(buffer, 0, buffer.length, offset);
		return buffer;
	} finally {
		await file.close();
	}
}

/** Where the current boot starts in a file: the first line stamped at or after the boot's start. */
async function currentBootOffset(
	path: string,
	bootStartedAt: number,
): Promise<number> {
	const text = await readFrom(path, 0);
	let offset = 0;
	for (const line of text.toString("utf8").split("\n")) {
		const at = LINE_AT.exec(line)?.[1];
		if (at && Number(at) >= bootStartedAt) return offset;
		offset += Buffer.byteLength(line) + 1;
	}
	return text.length;
}

/**
 * Sends each complete line the files gain, from the current boot on. Nothing
 * restarts host-service within a boot, so the offsets live in memory.
 */
export async function createBoxLogFiles(options: {
	files: ReadonlyArray<{ source: BoxLogSource; path: string }>;
	bootStartedAt: number;
	emit: (source: BoxLogSource, line: string) => void;
}): Promise<{ poll: () => Promise<void> }> {
	const state = await Promise.all(
		options.files.map(async (file) => ({
			...file,
			offset: await currentBootOffset(file.path, options.bootStartedAt),
		})),
	);
	return {
		poll: async () => {
			for (const file of state) {
				const added = await readFrom(file.path, file.offset);
				const end = added.lastIndexOf("\n");
				if (end === -1) continue;
				file.offset += end + 1;
				for (const line of added
					.subarray(0, end)
					.toString("utf8")
					.split("\n")) {
					if (line) options.emit(file.source, line);
				}
			}
		},
	};
}

export async function startBoxLogFiles(
	bootStartedAt: number,
	emit: (source: BoxLogSource, line: string) => void,
): Promise<void> {
	const files = await createBoxLogFiles({
		files: BOX_LOG_FILES,
		bootStartedAt,
		emit,
	});
	const loop = async () => {
		await files.poll();
		setTimeout(loop, POLL_MS).unref();
	};
	await loop();
}
