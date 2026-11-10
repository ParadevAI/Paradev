import { useEffect, useRef } from "react";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useFrameStackStore } from "../../../../../../core/frames";
import type { SwitcherRow } from "../../../../utils/bucketWorkspaces";

export interface SwitcherCycle {
	selectedValue: string | undefined;
	onSelectedValueChange: (value: string) => void;
}

type Row = SwitcherRow<AccessibleV2Workspace>;

function holdsAnyModifier(e: KeyboardEvent): boolean {
	return e.metaKey || e.ctrlKey || e.altKey;
}

export function useSwitcherCycle(
	cycle: SwitcherCycle | undefined,
	ordered: Row[],
	query: string,
	select: (row: Row, index: number, viaHold: boolean) => void,
): void {
	const cycling = cycle !== undefined;
	const step = useFrameStackStore((s) => s.switcherStep);
	const hold = useFrameStackStore((s) => s.switcherHold);
	const releaseHold = useFrameStackStore((s) => s.releaseSwitcherHold);
	const setSelection = useFrameStackStore((s) => s.setSwitcherSelection);
	const latest = useRef({ cycle, ordered, select });
	latest.current = { cycle, ordered, select };
	const selectedValue = cycle?.selectedValue;
	const selectedIndex = ordered.findIndex(
		(row) => row.workspace.id === selectedValue,
	);

	useEffect(() => {
		if (!cycling || ordered.length === 0 || selectedIndex >= 0) return;
		latest.current.cycle?.onSelectedValueChange(ordered[0].workspace.id);
	}, [cycling, ordered, selectedIndex]);

	useEffect(() => {
		if (!cycling) return;
		const row = selectedIndex >= 0 ? ordered[selectedIndex] : undefined;
		setSelection(
			row
				? {
						id: row.workspace.id,
						name: row.workspace.name,
						hostType: row.workspace.hostType,
						bucket: row.bucket,
						index: selectedIndex,
					}
				: null,
		);
	}, [cycling, ordered, selectedIndex, setSelection]);

	const seenStep = useRef(step);
	useEffect(() => {
		if (step === seenStep.current) return;
		seenStep.current = step;
		const { cycle: current, ordered: rows } = latest.current;
		if (!current || rows.length === 0) return;
		const index = rows.findIndex(
			(row) => row.workspace.id === current.selectedValue,
		);
		current.onSelectedValueChange(rows[(index + 1) % rows.length].workspace.id);
	}, [step]);

	useEffect(() => {
		if (query) releaseHold();
	}, [query, releaseHold]);

	useEffect(() => {
		if (!cycling || !hold) return;
		const onKeyUp = (e: KeyboardEvent) => {
			if (holdsAnyModifier(e)) return;
			const { cycle: current, ordered: rows, select: open } = latest.current;
			const index = rows.findIndex(
				(row) => row.workspace.id === current?.selectedValue,
			);
			if (index >= 0) open(rows[index], index, true);
			else useFrameStackStore.getState().setOpen(false);
		};
		window.addEventListener("keyup", onKeyUp, true);
		window.addEventListener("blur", releaseHold);
		return () => {
			window.removeEventListener("keyup", onKeyUp, true);
			window.removeEventListener("blur", releaseHold);
		};
	}, [cycling, hold, releaseHold]);
}
