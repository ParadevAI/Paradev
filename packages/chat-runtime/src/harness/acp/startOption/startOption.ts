type Choice = { id: string; label: string };

function words(value: string): string[] {
	return value
		.toLowerCase()
		.replace(/\[[^\]]*\]/g, "")
		.replace(/(\d)-(\d{1,2})\b/g, "$1.$2")
		.split(/[^a-z0-9.]+/)
		.filter(Boolean);
}

function variant(value: string): string {
	return (value.toLowerCase().match(/\[[^\]]*\]/g) ?? []).join("");
}

function vendorOrDate(word: string): boolean {
	return word === "claude" || /^\d{8}$/.test(word);
}

function same(a: string, b: string): boolean {
	return words(a).join("-") === words(b).join("-");
}

export function startOptionId(
	choices: readonly Choice[],
	wanted: string,
): string | undefined {
	if (choices.some((choice) => choice.id === wanted)) return wanted;
	const candidates = choices.filter(
		(choice) => variant(choice.id) === variant(wanted),
	);
	const spelled = candidates.filter(
		(choice) => same(choice.id, wanted) || same(choice.label, wanted),
	);
	if (spelled.length > 0)
		return spelled.reduce((a, b) => (b.id.length < a.id.length ? b : a)).id;
	const want = words(wanted);
	if (want.length === 0) return undefined;
	const family = new Map<string, string>();
	for (const choice of candidates) {
		const have = new Set([...words(choice.id), ...words(choice.label)]);
		const label = new Set(words(choice.label));
		const versioned =
			[...label].some((word) => /\d/.test(word)) &&
			[...label].some((word) => /[a-z]/.test(word));
		const named =
			want.every((word) => have.has(word)) ||
			(versioned &&
				[...label].every((word) => want.includes(word)) &&
				want.every((word) => label.has(word) || vendorOrDate(word)));
		if (!named) continue;
		const model = words(choice.id).join("-");
		const known = family.get(model);
		if (!known || choice.id.length < known.length) family.set(model, choice.id);
	}
	return family.size === 1 ? [...family.values()][0] : undefined;
}
