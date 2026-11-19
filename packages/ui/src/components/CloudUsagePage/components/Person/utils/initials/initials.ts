/** Up to two letters, from the first and last words: "Maya van Dijk" -> "MD". */
export function initials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	const first = words[0]?.[0] ?? "";
	const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
	return (first + last).toLocaleUpperCase();
}
