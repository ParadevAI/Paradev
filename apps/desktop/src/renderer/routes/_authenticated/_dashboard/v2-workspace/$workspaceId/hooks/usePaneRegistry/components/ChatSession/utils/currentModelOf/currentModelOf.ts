import type { SessionConfigOption } from "@superset/chat/protocol";

export function currentModelOf(
	configOptions: SessionConfigOption[] | undefined,
): { id: string; label: string } | null {
	const option = configOptions?.find(
		(entry) => entry.category === "model" && entry.options.length > 0,
	);
	if (!option?.currentValue) return null;
	const label = option.options.find(
		(entry) => entry.id === option.currentValue,
	)?.label;
	return { id: option.currentValue, label: label ?? option.currentValue };
}
