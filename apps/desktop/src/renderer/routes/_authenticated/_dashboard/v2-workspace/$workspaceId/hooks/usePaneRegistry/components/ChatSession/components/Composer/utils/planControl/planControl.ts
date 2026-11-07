import type { SessionConfigOption } from "@superset/chat/protocol";

export const PLAN_ID = "plan";
const DEFAULT_ID = "default";

export type PlanSwitch =
	| { modeId: string }
	| { configId: string; value: string };

export type PlanControl = {
	active: boolean;
	enter: PlanSwitch;
	leave: PlanSwitch;
};

/**
 * Plan is a session mode for some agents and a config option for others.
 * Leaving it goes back to the mode it was entered from when that is known.
 */
export function planControl({
	configOptions,
	modes,
	currentModeId,
	modeBeforePlan,
}: {
	configOptions: readonly SessionConfigOption[];
	modes: readonly { id: string }[];
	currentModeId: string | undefined;
	modeBeforePlan: string | undefined;
}): PlanControl | null {
	if (modes.some((mode) => mode.id === PLAN_ID)) {
		const others = modes.filter((mode) => mode.id !== PLAN_ID);
		const leaveTo =
			others.find((mode) => mode.id === modeBeforePlan) ??
			others.find((mode) => mode.id === DEFAULT_ID) ??
			others[0];
		if (!leaveTo) return null;
		return {
			active: currentModeId === PLAN_ID,
			enter: { modeId: PLAN_ID },
			leave: { modeId: leaveTo.id },
		};
	}
	const option = configOptions.find(
		(candidate) =>
			candidate.category !== "model" &&
			candidate.category !== "mode" &&
			candidate.options.some((entry) => entry.id === PLAN_ID),
	);
	const leaveTo =
		option?.options.find((entry) => entry.id === DEFAULT_ID) ??
		option?.options.find((entry) => entry.id !== PLAN_ID);
	if (!option || !leaveTo) return null;
	return {
		active: option.currentValue === PLAN_ID,
		enter: { configId: option.id, value: PLAN_ID },
		leave: { configId: option.id, value: leaveTo.id },
	};
}
