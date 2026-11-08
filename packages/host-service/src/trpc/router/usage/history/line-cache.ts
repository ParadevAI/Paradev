import { stat } from "node:fs/promises";
import { readLinesFrom } from "./parse";
import { MemoryStateStore, type UsageStateStore } from "./usage-store";

/** A per-file parser whose `state` is plain JSON data: a parser rebuilt from
 * a saved `state` continues where the saved one stopped. */
export interface LineParser<R, S = unknown> {
	readonly state: S;
	onLine(line: string): void;
	result(): R;
}

type CreateLineParser<R, S> = (state?: S) => LineParser<R, S>;

/** Parses one line-oriented file. `kind` names the parser, so two collectors
 * reading the same path never share state. */
export type ParseLines = <R, S>(
	kind: string,
	path: string,
	create: CreateLineParser<R, S>,
) => Promise<R>;

export const parseWholeFile: ParseLines = async (_kind, path, create) => {
	const parser = create();
	await readLinesFrom(path, 0, (line) => parser.onLine(line));
	return parser.result();
};

interface FileCursor {
	ino: number;
	mtimeMs: number;
	end: number;
	partialTail: boolean;
	state: unknown;
}

/** Saves where each file's parse stopped. A file that grew is read from
 * there; one that shrank, was replaced, or changed in place is read again. */
export class LineFileCache {
	constructor(
		private readonly store: UsageStateStore = new MemoryStateStore(),
	) {}

	readonly parse: ParseLines = async <R, S>(
		kind: string,
		path: string,
		create: CreateLineParser<R, S>,
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
		if (
			cursor &&
			cursor.ino === info.ino &&
			!cursor.partialTail &&
			info.size >= cursor.end
		) {
			const parser = create(cursor.state as S);
			if (info.size === cursor.end && info.mtimeMs === cursor.mtimeMs) {
				return parser.result();
			}
			if (info.size > cursor.end) {
				const read = await readLinesFrom(path, cursor.end, (line) =>
					parser.onLine(line),
				);
				// A failed read leaves the state ahead of the saved offset.
				if (read) await this.save(key, path, read, parser);
				else this.store.delete(key);
				return parser.result();
			}
		}
		const parser = create();
		const read = await readLinesFrom(path, 0, (line) => parser.onLine(line));
		if (read) await this.save(key, path, read, parser);
		else this.store.delete(key);
		return parser.result();
	};

	private async save(
		key: string,
		path: string,
		read: { end: number; partialTail: boolean },
		parser: LineParser<unknown>,
	): Promise<void> {
		try {
			// Stat after the read, so growth during the read resumes next time.
			const { ino, mtimeMs } = await stat(path);
			const cursor: FileCursor = {
				ino,
				mtimeMs,
				end: read.end,
				partialTail: read.partialTail,
				state: parser.state,
			};
			this.store.set(key, cursor);
		} catch {
			this.store.delete(key);
		}
	}
}
