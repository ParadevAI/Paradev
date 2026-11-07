type Choice = { id: string; label: string };

function words(value: string): string[] {
	return value
		.toLowerCase()
		.replace(/\[[^\]]*\]/g, "")
		.replace(/(\d)-(\d)\b/g, "$1.$2")
		.split(/[^a-z0-9.]+/)
		.filter(Boolean);
}

function same(a: string, b: string): boolean {
	return words(a).join("-") === words(b).join("-");
}

export function startOptionId(
	choices: readonly Choice[],
	wanted: string,
): string | undefined {
	if (choices.some((choice) => choice.id === wanted)) return wanted;
	const spelled = choices.filter(
		(choice) => same(choice.id, wanted) || same(choice.label, wanted),
	);
	if (spelled.length > 0)
		return spelled.reduce((a, b) => (b.id.length < a.id.length ? b : a)).id;
	const want = words(wanted);
	if (want.length === 0) return undefined;
	const wantSet = new Set(want);
	const family = new Map<string, string>();
	for (const choice of choices) {
		const have = new Set([...words(choice.id), ...words(choice.label)]);
		const label = words(choice.label);
		const named =
			want.every((word) => have.has(word)) ||
			(label.length > 0 && label.every((word) => wantSet.has(word)));
		if (!named) continue;
		const model = words(choice.id).join("-");
		const known = family.get(model);
		if (!known || choice.id.length < known.length) family.set(model, choice.id);
	}
	return family.size === 1 ? [...family.values()][0] : undefined;
}
