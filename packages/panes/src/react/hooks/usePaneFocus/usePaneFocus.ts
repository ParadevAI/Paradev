import {
	createContext,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
} from "react";

type RegisterPaneFocus = (focus: () => void) => () => void;

export const PaneFocusContext = createContext<RegisterPaneFocus | null>(null);

/** Where keyboard focus goes when this pane is opened or focused again. */
export function usePaneFocus(focus: () => void): void {
	const register = useContext(PaneFocusContext);
	const focusRef = useRef(focus);
	useLayoutEffect(() => {
		focusRef.current = focus;
	});
	useEffect(() => register?.(() => focusRef.current()), [register]);
}
