import type { SessionConfigOption } from "@superset/chat/protocol";
import { useMemo, useState } from "react";
import { PLAN_ID, type PlanSwitch, planControl } from "../../utils/planControl";

export type PlanToggleControl = {
	active: boolean;
	enter: () => void;
	leave: () => void;
	/** The approval mode plan returns to, when plan is a session mode. */
	returnModeId?: string;
};

export function usePlanControl({
	configOptions,
	modes,
	currentModeId,
	onSetMode,
	onSetConfigOption,
}: {
	configOptions: readonly SessionConfigOption[] | undefined;
	modes: readonly { id: string }[] | undefined;
	currentModeId: string | undefined;
	onSetMode: ((modeId: string) => void) | undefined;
	onSetConfigOption: ((configId: string, value: string) => unknown) | undefined;
}): PlanToggleControl | null {
	const [modeBeforePlan, setModeBeforePlan] = useState(currentModeId);
	if (
		currentModeId &&
		currentModeId !== PLAN_ID &&
		currentModeId !== modeBeforePlan
	) {
		setModeBeforePlan(currentModeId);
	}

	return useMemo(() => {
		const plan = planControl({
			configOptions: configOptions ?? [],
			modes: modes ?? [],
			currentModeId,
			modeBeforePlan,
		});
		if (!plan) return null;
		const apply = (change: PlanSwitch) => {
			if ("modeId" in change) onSetMode?.(change.modeId);
			else onSetConfigOption?.(change.configId, change.value);
		};
		if (!("modeId" in plan.enter ? onSetMode : onSetConfigOption)) return null;
		return {
			active: plan.active,
			enter: () => apply(plan.enter),
			leave: () => apply(plan.leave),
			...("modeId" in plan.leave ? { returnModeId: plan.leave.modeId } : {}),
		};
	}, [
		configOptions,
		currentModeId,
		modeBeforePlan,
		modes,
		onSetConfigOption,
		onSetMode,
	]);
}
