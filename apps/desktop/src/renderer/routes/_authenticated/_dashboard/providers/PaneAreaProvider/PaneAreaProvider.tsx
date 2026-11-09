import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";

export type PaneArea = "center" | "right";

interface PaneAreaContextValue {
	area: PaneArea;
	focusedArea: () => PaneArea;
}

const PaneAreaContext = createContext<PaneAreaContextValue | null>(null);

export function PaneAreaProvider({
	area,
	focusedArea,
	children,
}: {
	area: PaneArea;
	/** Read at keypress time: the area the reader last pressed or focused in. */
	focusedArea: () => PaneArea;
	children: ReactNode;
}) {
	const value = useMemo(() => ({ area, focusedArea }), [area, focusedArea]);
	return (
		<PaneAreaContext.Provider value={value}>
			{children}
		</PaneAreaContext.Provider>
	);
}

/**
 * An `ignoreEventWhen` for pane hotkeys. The main area and the right sidebar
 * each keep their own active pane, so `isActive` alone lets one keystroke
 * reach a pane in each. Outside a pane area it ignores nothing.
 */
export function usePaneAreaHotkeyGuard(): () => boolean {
	const context = useContext(PaneAreaContext);
	return useCallback(
		() => context !== null && context.focusedArea() !== context.area,
		[context],
	);
}
