import type { AvailableCommand, TextElement } from "@superset/chat/protocol";
import { LEADING_COMMAND } from "../../../../../../utils/commandChip";
import { findMcpServerTokens } from "../../../../../../utils/mcpServerChips";

const encoder = new TextEncoder();
const SKILL_NAME = /(^|\s)([\w-]+:[\w:-]*\w)(?=$|[\s.,!?;)])/g;

function byteOffset(text: string, index: number): number {
	return encoder.encode(text.slice(0, index)).length;
}

/** The chips a message without recorded elements still spells: a replayed one. */
export function textElementsFromText(
	text: string,
	commands: ReadonlyMap<string, AvailableCommand> | undefined,
): TextElement[] {
	const leading = LEADING_COMMAND.exec(text)?.[1];
	return [
		...(leading && commands?.has(leading)
			? [
					{
						byteRange: { start: 0, end: leading.length + 1 },
						elementKind: "slash_command" as const,
					},
				]
			: []),
		...[...text.matchAll(SKILL_NAME)].flatMap((match) => {
			const name = match[2] ?? "";
			if (!commands?.has(name)) return [];
			const start = (match.index ?? 0) + (match[1]?.length ?? 0);
			return [
				{
					byteRange: {
						start: byteOffset(text, start),
						end: byteOffset(text, start + name.length),
					},
					elementKind: "slash_command" as const,
				},
			];
		}),
		...findMcpServerTokens(text).map(({ start, end }) => ({
			byteRange: { start: byteOffset(text, start), end: byteOffset(text, end) },
			elementKind: "other" as const,
		})),
	];
}
