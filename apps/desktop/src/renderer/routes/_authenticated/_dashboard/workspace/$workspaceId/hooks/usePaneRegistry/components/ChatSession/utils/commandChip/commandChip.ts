import type { ComposerChip } from "@superset/chat-ui/PromptInput";

export const LEADING_COMMAND = /^\/([\w:-]+)(?=\s|$)/;

/** Codex names its skills `$name` and only reads them in that form. */
export function isSigilSkill(name: string): boolean {
	return name.startsWith("$");
}

export function commandLabel(name: string): string {
	const base = name
		.slice(name.lastIndexOf(":") + 1)
		.replace(/^\$/, "")
		.replace(/[-_]+/g, " ")
		.trim();
	return base ? `${base[0]?.toUpperCase()}${base.slice(1)}` : name;
}

export function commandChip(
	name: string,
	description?: string | undefined,
): ComposerChip {
	return {
		label: commandLabel(name),
		serialized: isSigilSkill(name) ? name : `/${name}`,
		...(description ? { description } : {}),
		data: { elementKind: "slash_command" },
	};
}
