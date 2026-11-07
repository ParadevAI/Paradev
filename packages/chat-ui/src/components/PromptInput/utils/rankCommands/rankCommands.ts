import type { PromptInputCommand } from "../../types";

const NAME_EXACT = 100;
const ALIAS_EXACT = 95;
const NAME_PREFIX = 80;
const ALIAS_PREFIX = 75;
const NAME_WORD_PREFIX = 60;
const NAME_SUBSTRING = 50;
const ALIAS_SUBSTRING = 45;
const NAME_SUBSEQUENCE = 30;
const DESCRIPTION_WORD_PREFIX = 20;
const DESCRIPTION_SUBSTRING = 10;
const DESCRIPTION_MIN_QUERY = 3;

function commandName(command: PromptInputCommand): string {
	return command.title.toLowerCase().replace(/^\//, "");
}

function isSubsequence(query: string, candidate: string): boolean {
	let matched = 0;
	for (const char of candidate) {
		if (char === query[matched]) matched += 1;
		if (matched === query.length) return true;
	}
	return false;
}

function nameScore(name: string, query: string): number {
	if (name === query) return NAME_EXACT;
	if (name.startsWith(query)) return NAME_PREFIX;
	if (name.split(/[:_-]/).some((word) => word.startsWith(query)))
		return NAME_WORD_PREFIX;
	if (name.includes(query)) return NAME_SUBSTRING;
	if (query.length > 1 && name[0] === query[0] && isSubsequence(query, name))
		return NAME_SUBSEQUENCE;
	return 0;
}

function aliasScore(alias: string, query: string): number {
	const lowered = alias.toLowerCase();
	if (lowered === query) return ALIAS_EXACT;
	if (lowered.startsWith(query)) return ALIAS_PREFIX;
	if (lowered.includes(query)) return ALIAS_SUBSTRING;
	return 0;
}

function descriptionScore(description: string, query: string): number {
	if (query.length < DESCRIPTION_MIN_QUERY) return 0;
	const lowered = description.toLowerCase();
	if (lowered.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query)))
		return DESCRIPTION_WORD_PREFIX;
	return lowered.includes(query) ? DESCRIPTION_SUBSTRING : 0;
}

function namedScore(command: PromptInputCommand, query: string): number {
	return Math.max(
		nameScore(commandName(command), query),
		...(command.searchAliases ?? []).map((alias) => aliasScore(alias, query)),
	);
}

/**
 * Descriptions are searched only when no name or alias matches. Groups stay
 * together, led by the group holding the best match; a tie goes to the group
 * listed first. Whitespace means arguments are being typed, so nothing is
 * offered.
 */
export function rankCommands(
	commands: PromptInputCommand[],
	query: string,
): PromptInputCommand[] {
	if (/\s/.test(query)) return [];
	const normalized = query.toLowerCase().replace(/^\//, "");
	if (normalized.length === 0) return commands;
	const groupOrder = new Map<string | null, number>();
	for (const command of commands) {
		const group = command.group ?? null;
		if (!groupOrder.has(group)) groupOrder.set(group, groupOrder.size);
	}
	const byName = commands.map((command) => namedScore(command, normalized));
	const searchDescriptions = byName.every((score) => score === 0);
	const scored = commands
		.map((command, index) => ({
			command,
			index,
			group: command.group ?? null,
			score: searchDescriptions
				? descriptionScore(command.description ?? "", normalized)
				: (byName[index] ?? 0),
		}))
		.filter((entry) => entry.score > 0);
	const groupBest = new Map<string | null, number>();
	for (const entry of scored) {
		groupBest.set(
			entry.group,
			Math.max(groupBest.get(entry.group) ?? 0, entry.score),
		);
	}
	return scored
		.sort(
			(a, b) =>
				(groupBest.get(b.group) ?? 0) - (groupBest.get(a.group) ?? 0) ||
				(groupOrder.get(a.group) ?? 0) - (groupOrder.get(b.group) ?? 0) ||
				b.score - a.score ||
				a.index - b.index,
		)
		.map((entry) => entry.command);
}
