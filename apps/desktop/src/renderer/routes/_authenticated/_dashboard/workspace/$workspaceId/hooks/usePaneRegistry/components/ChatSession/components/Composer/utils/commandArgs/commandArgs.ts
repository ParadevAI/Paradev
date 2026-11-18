import type { ChatForkTarget } from "../../../../types";
import { LEADING_COMMAND } from "../../../../utils/commandChip";

export const FORK_TARGET_ARGS: Record<ChatForkTarget, string> = {
	workspace: "here",
	worktree: "worktree",
};

export function splitInvocation(
	text: string,
): { name: string; args: string } | null {
	const trimmed = text.trim();
	const match = LEADING_COMMAND.exec(trimmed);
	const name = match?.[1];
	if (!match || !name) return null;
	return {
		name: name.toLowerCase(),
		args: trimmed.slice(match[0].length).trim(),
	};
}

/** No argument flips the switch. */
export function parseSwitch(args: string, current: boolean): boolean | null {
	const word = args.trim().toLowerCase();
	if (word === "") return !current;
	if (word === "on") return true;
	if (word === "off") return false;
	return null;
}

/** No argument takes the first target offered. */
export function parseForkTarget(
	args: string,
	targets: readonly ChatForkTarget[],
): ChatForkTarget | null {
	const word = args.trim().toLowerCase();
	const target =
		word === ""
			? targets[0]
			: targets.find((candidate) => FORK_TARGET_ARGS[candidate] === word);
	return target ?? null;
}
