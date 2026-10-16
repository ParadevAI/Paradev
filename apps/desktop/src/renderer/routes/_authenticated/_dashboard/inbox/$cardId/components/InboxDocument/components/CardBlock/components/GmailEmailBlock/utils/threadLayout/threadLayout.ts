/** One row of the thread as Gmail lays it out: a message open or folded, or a count standing for several folded ones. */
export type ThreadRow =
	| { kind: "message"; index: number; open: boolean }
	| { kind: "hidden"; indexes: number[] };

/**
 * Gmail opens the last message and any unread one, folds the rest, and past
 * three messages shows the first, a count for the read run in the middle,
 * and the last two. `toggled` holds the messages the reader opened or folded.
 */
export function threadLayout(
	messages: readonly { unread: boolean }[],
	toggled: ReadonlyMap<number, boolean>,
	revealed: boolean,
): ThreadRow[] {
	const last = messages.length - 1;
	const open = (i: number) =>
		toggled.get(i) ?? (i === last || Boolean(messages[i]?.unread));
	const rows: ThreadRow[] = [];
	let run: number[] = [];
	const flush = () => {
		if (run.length >= 2 && !revealed)
			rows.push({ kind: "hidden", indexes: run });
		else
			for (const i of run)
				rows.push({ kind: "message", index: i, open: false });
		run = [];
	};
	messages.forEach((_, i) => {
		const middle = i > 0 && i < last - 1;
		if (middle && !open(i)) {
			run.push(i);
			return;
		}
		flush();
		rows.push({ kind: "message", index: i, open: open(i) });
	});
	flush();
	return rows;
}
