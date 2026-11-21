import type { SessionConfigOption } from "@superset/chat/protocol";

export function isToggleOption(option: SessionConfigOption): boolean {
	return (
		option.options.length === 2 &&
		option.options.some((entry) => entry.id === "on") &&
		option.options.some((entry) => entry.id === "off")
	);
}

export function fastOption(
	options: readonly SessionConfigOption[],
): SessionConfigOption | undefined {
	return options.find(
		(option) => option.id === "fast" && isToggleOption(option),
	);
}
