import { open, stat } from "node:fs/promises";
import { readLinesFrom } from "./parse";
import { MemoryStateStore, type UsageStateStore } from "./usage-store";

/** A per-file parser whose `state` is plain JSON data: a parser rebuilt from
 * a saved `state` continues where the saved one stopped. */
export interface LineParser<R, S = unknown> {
	readonly state: S;
	onLine(line: string): void;
	result(): R;
	/** Drops entries before `cutoffMs` from the state; true if any were. */
	prune?(cutoffMs: number): boolean;
}

type CreateLineParser<R, S> = (state?: S) => LineParser<R, S>;

/** Parses one line-oriented file. `kind` names the parser, so two collectors
 * reading the same path never share state. */
export type ParseLines = <R, S>(
	kind: string,
	path: string,
	create: CreateLineParser<R, S>,
	cutoffMs: number,
) => Promise<R>;

export const parseWholeFile: ParseLines = async (_kind, path, create) => {
	const parser = create();
	await readLinesFrom(path, 0, (line) => parser.onLine(line));
	return parser.result();
};

/** Bytes compared to tell an append from a rewrite of the same file. */
const HEAD_BYTES = 64;
/** Lines between prunes while reading, so a cold read of a long log never
 * holds all its expired entries at once. */
const PRUNE_EVERY_LINES = 50_000;

interface FileCursor {
	ino: number;
	mtimeMs: number;
	/** Bytes read, an unterminated last line included. */
	size: number;
	/** Offset just past the last complete line. */
	end: number;
	partialTail: boolean;
	/** Hex of the first HEAD_BYTES bytes when the cursor was saved. */
	head: string;
	/** Entries before this were pruned; an earlier cutoff reads the file again. */
	prunedBefore: number;
	state: unknown;
}

/** Saves where each file's parse stopped. A file that only grew is read from
 * there; any other change, or a saved state that fails, reads it again. */
export class LineFileCache {
	constructor(
		private readonly store: UsageStateStore = new MemoryStateStore(),
	) {}

	readonly parse: ParseLines = async <R, S>(
		kind: string,
		path: string,
		create: CreateLineParser<R, S>,
		cutoffMs: number,
	): Promise<R> => {
		const key = `file\u0000${kind}\u0000${path}`;
		let info: Awaited<ReturnType<typeof stat>>;
		try {
			info = await stat(path);
		} catch {
			this.store.delete(key);
			return create().result();
		}
		const cursor = this.store.get(key) as FileCursor | undefined;
		if (cursor?.ino === info.ino) {
			try {
				const cached = await this.fromCursor(
					key,
					path,
					info,
					cursor,
					create,
					cutoffMs,
				);
				if (cached) return cached.value;
			} catch {
				// A saved state the parser cannot take; read the file again.
			}
		}
		const parser = create();
		const read = await readLinesFrom(path, 0, feed(parser, cutoffMs));
		parser.prune?.(cutoffMs);
		if (read) await this.save(key, path, info.ino, read, parser, cutoffMs);
		else this.store.delete(key);
		return parser.result();
	};

	/** The result from the saved cursor, or null when the file must be read
	 * again from the start. */
	private async fromCursor<R, S>(
		key: string,
		path: string,
		info: { ino: number; size: number; mtimeMs: number },
		cursor: FileCursor,
		create: CreateLineParser<R, S>,
		cutoffMs: number,
	): Promise<{ value: R } | null> {
		if (cutoffMs < (cursor.prunedBefore ?? 0)) return null;
		if (info.size === cursor.size && info.mtimeMs === cursor.mtimeMs) {
			const parser = create(cursor.state as S);
			if (parser.prune?.(cutoffMs)) {
				this.store.set(key, { ...cursor, prunedBefore: cutoffMs });
			}
			return { value: parser.result() };
		}
		if (
			cursor.partialTail ||
			info.size <= cursor.end ||
			(await readHead(path, cursor.head.length / 2)) !== cursor.head
		) {
			return null;
		}
		const parser = create(cursor.state as S);
		const read = await readLinesFrom(path, cursor.end, feed(parser, cutoffMs));
		parser.prune?.(cutoffMs);
		// A failed read leaves the state ahead of the saved offset.
		if (read) await this.save(key, path, info.ino, read, parser, cutoffMs);
		else this.store.delete(key);
		return { value: parser.result() };
	}

	private async save(
		key: string,
		path: string,
		readIno: number,
		read: { end: number; partialTail: boolean; size: number },
		parser: LineParser<unknown>,
		prunedBefore: number,
	): Promise<void> {
		try {
			const [{ ino, mtimeMs, size }, head] = await Promise.all([
				stat(path),
				readHead(path, HEAD_BYTES),
			]);
			// Replaced during the read: the state belongs to the old file.
			if (ino !== readIno) {
				this.store.delete(key);
				return;
			}
			const cursor: FileCursor = {
				ino,
				// Growth during the read leaves the file larger than what was
				// read; record that so the next scan does not take it as unchanged.
				mtimeMs: size === read.size ? mtimeMs : -1,
				size: read.size,
				end: read.end,
				partialTail: read.partialTail,
				head,
				prunedBefore,
				state: parser.state,
			};
			this.store.set(key, cursor);
		} catch {
			this.store.delete(key);
		}
	}
}

function feed(
	parser: LineParser<unknown>,
	cutoffMs: number,
): (line: string) => void {
	let lines = 0;
	return (line) => {
		parser.onLine(line);
		if (++lines % PRUNE_EVERY_LINES === 0) parser.prune?.(cutoffMs);
	};
}

async function readHead(path: string, bytes: number): Promise<string> {
	const file = await open(path, "r");
	try {
		const buffer = Buffer.alloc(bytes);
		const { bytesRead } = await file.read(buffer, 0, bytes, 0);
		return buffer.subarray(0, bytesRead).toString("hex");
	} finally {
		await file.close();
	}
}
