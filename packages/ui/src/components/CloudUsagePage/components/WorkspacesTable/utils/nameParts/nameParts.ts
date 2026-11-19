/** The most of a name's end kept visible when the rest is cut. */
const TAIL_MAX = 16;
const TAIL_MIN = 6;

/** A name split so its start can be cut and its end, where names in a series differ, stays. */
export function nameParts(name: string): { head: string; tail: string } {
	if (name.length <= TAIL_MAX) return { head: name, tail: "" };
	const dash = name.lastIndexOf("-", name.length - TAIL_MIN);
	const at = dash >= name.length - TAIL_MAX ? dash : name.length - TAIL_MIN;
	return { head: name.slice(0, at), tail: name.slice(at) };
}
