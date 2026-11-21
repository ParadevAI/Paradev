import type { UserContent } from "../../protocol/items";

export const CONTINUE_PROMPT = "Continue where you left off.";

export const CONTINUE_AFTER_UPDATE_PROMPT = `Paradev restarted to install an update, which stopped your work before it finished, including any commands running in the background. ${CONTINUE_PROMPT}`;

export function isContinuePrompt(content: UserContent[]): boolean {
	const [part] = content;
	return (
		content.length === 1 &&
		part?.type === "text" &&
		(part.text === CONTINUE_PROMPT ||
			part.text === CONTINUE_AFTER_UPDATE_PROMPT)
	);
}

export function withoutRepeatedContinue(
	prompts: UserContent[][],
	alreadyWaiting = false,
): UserContent[][] {
	let waiting = alreadyWaiting;
	return prompts.filter((content) => {
		if (!isContinuePrompt(content)) return true;
		if (waiting) return false;
		waiting = true;
		return true;
	});
}
