import { buildRestackPrompt } from "../../utils/buildPullRequestRepairPrompts";
import {
	type PullRequestHandoffTarget,
	usePullRequestAgentHandoff,
} from "../usePullRequestAgentHandoff";
import type { PullRequestStack } from "../usePullRequestStack";

export interface StackRestackAction {
	mergedNumber: number;
	/** Hands the restack to an agent; null when there is none to give it to. */
	run: (() => void) | null;
	isPending: boolean;
}

export function useStackRestack(
	handoffTarget: PullRequestHandoffTarget | null,
	stack: PullRequestStack | null,
): StackRestackAction | null {
	const handoff = usePullRequestAgentHandoff(handoffTarget);
	const current = stack?.layers.find((layer) => layer.isCurrent);
	const merged = stack?.restack;
	if (!stack || !current || !merged) return null;
	return {
		mergedNumber: merged.number,
		isPending: handoff.isPending,
		run: handoff.available
			? () =>
					handoff.handOff(
						buildRestackPrompt({
							number: current.number,
							url: current.url,
							headRefName: current.headRefName,
							baseRefName: stack.baseRefName,
							merged: {
								number: merged.number,
								headRefOid: merged.headRefOid,
							},
						}),
					)
			: null,
	};
}
