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

export type CutOffWork = {
	interrupted: boolean;
	prompts: UserContent[][];
	pausedPrompts: UserContent[][];
};

/**
 * A continue that was still waiting is not carried over: the chat counts as
 * interrupted, and the resume says it once.
 */
export function withoutWaitingContinues<Work extends CutOffWork>(
	work: Work,
): Work {
	const waiting = [...work.prompts, ...work.pausedPrompts];
	if (!waiting.some(isContinuePrompt)) return work;
	const rest = (prompts: UserContent[][]) =>
		prompts.filter((content) => !isContinuePrompt(content));
	return {
		...work,
		interrupted: true,
		prompts: rest(work.prompts),
		pausedPrompts: rest(work.pausedPrompts),
	};
}
