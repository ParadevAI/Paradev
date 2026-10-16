export interface DiffWord {
	text: string;
	changed: boolean;
}

export interface DiffLine {
	kind: "same" | "removed" | "added";
	words: DiffWord[];
}

type Step = "same" | "removed" | "added";

/** The shortest edit from `a` to `b`, removals ahead of additions where both fit. */
function steps<T>(a: readonly T[], b: readonly T[]): Step[] {
	const width = b.length + 1;
	const common = new Uint32Array((a.length + 1) * width);
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			common[i * width + j] =
				a[i] === b[j]
					? (common[(i + 1) * width + j + 1] ?? 0) + 1
					: Math.max(
							common[(i + 1) * width + j] ?? 0,
							common[i * width + j + 1] ?? 0,
						);
	const out: Step[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			out.push("same");
			i++;
			j++;
		} else if (
			j >= b.length ||
			(i < a.length &&
				(common[(i + 1) * width + j] ?? 0) >= (common[i * width + j + 1] ?? 0))
		) {
			out.push("removed");
			i++;
		} else {
			out.push("added");
			j++;
		}
	}
	return out;
}

const tokens = (line: string) => line.split(/(\s+)/).filter(Boolean);

function wordPair(before: string, after: string): [DiffWord[], DiffWord[]] {
	const a = tokens(before);
	const b = tokens(after);
	const removed: DiffWord[] = [];
	const added: DiffWord[] = [];
	let i = 0;
	let j = 0;
	for (const step of steps(a, b)) {
		if (step === "same") {
			removed.push({ text: a[i++] ?? "", changed: false });
			added.push({ text: b[j++] ?? "", changed: false });
		} else if (step === "removed")
			removed.push({ text: a[i++] ?? "", changed: true });
		else added.push({ text: b[j++] ?? "", changed: true });
	}
	return [removed, added];
}

const whole = (text: string): DiffWord[] => [{ text, changed: false }];

/** A line diff of two texts. A removed line and the added line that took its place carry the words that differ. */
export function diffLines(before: string, after: string): DiffLine[] {
	const a = before.split("\n");
	const b = after.split("\n");
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	let removed: string[] = [];
	let added: string[] = [];
	const flush = () => {
		const pairs = removed.map((line, index) =>
			added[index] === undefined ? null : wordPair(line, added[index]),
		);
		removed.forEach((line, index) => {
			out.push({ kind: "removed", words: pairs[index]?.[0] ?? whole(line) });
		});
		added.forEach((line, index) => {
			out.push({ kind: "added", words: pairs[index]?.[1] ?? whole(line) });
		});
		removed = [];
		added = [];
	};
	for (const step of steps(a, b)) {
		if (step === "removed") removed.push(a[i++] ?? "");
		else if (step === "added") added.push(b[j++] ?? "");
		else {
			flush();
			out.push({ kind: "same", words: whole(a[i++] ?? "") });
			j++;
		}
	}
	flush();
	return out;
}
