import { mkdir, open, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { TranscriptRow } from "../../clients/sessionStore";

export const FILE_STEP = "pdev/file";
const LINES_STEP = "pdev/lines/";

export interface PdevEntry {
	type: string;
	id?: string;
	timestamp?: string;
	message?: unknown;
	[key: string]: unknown;
}

export function linesStepKey(entries: PdevEntry[]): string {
	return `${LINES_STEP}${entries.at(-1)?.id ?? entries.length}`;
}

export function pdevEntriesOf(rows: TranscriptRow[]): PdevEntry[] {
	return rows
		.filter((row) => row.stepKey.startsWith(LINES_STEP))
		.map((row) => row.entry as PdevEntry);
}

/** Writes the stored session back where pdev looks for it. Returns pdev's session id, if there was one. */
export async function restoreSessionFile(
	agentDir: string,
	rows: TranscriptRow[],
): Promise<string | null> {
	const path = rows.find((row) => row.stepKey === FILE_STEP)?.entry as
		| { path?: string }
		| undefined;
	const entries = pdevEntriesOf(rows);
	const header = entries.find((entry) => entry.type === "session");
	if (!path?.path || !header?.id) return null;
	const file = join(agentDir, path.path);
	await mkdir(dirname(file), { recursive: true });
	await writeFile(
		file,
		entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""),
	);
	return header.id;
}

/** Reads the entries pdev appends to its session file, a whole line at a time. */
export class SessionFileTail {
	private file: string | null = null;
	private offset = 0;

	constructor(private readonly agentDir: string) {}

	get relativePath(): string | null {
		return this.file ? relative(this.agentDir, this.file) : null;
	}

	/** Skips what is already there, after a restore. */
	async skipExisting(): Promise<void> {
		await this.read();
	}

	async read(): Promise<PdevEntry[]> {
		this.file ??= await findSessionFile(join(this.agentDir, "sessions"));
		if (!this.file) return [];
		const handle = await open(this.file, "r");
		try {
			const { size } = await handle.stat();
			if (size <= this.offset) return [];
			const buffer = Buffer.alloc(size - this.offset);
			await handle.read(buffer, 0, buffer.length, this.offset);
			// A line pdev is still writing may end mid-character; decode only whole lines.
			const end = buffer.lastIndexOf(0x0a);
			if (end < 0) return [];
			this.offset += end + 1;
			return buffer
				.subarray(0, end)
				.toString("utf8")
				.split("\n")
				.filter((line) => line.trim())
				.map((line) => JSON.parse(line) as PdevEntry);
		} finally {
			await handle.close();
		}
	}
}

async function findSessionFile(dir: string): Promise<string | null> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (entry.name === "subagents") continue;
		const path = join(dir, entry.name);
		if (entry.isFile() && entry.name.endsWith(".jsonl")) return path;
		if (entry.isDirectory()) {
			const found = await findSessionFile(path);
			if (found) return found;
		}
	}
	return null;
}
