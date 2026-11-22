import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { type PartialRoute, withParentRoutes } from "../../parentRoutes";

const RESET_TIMEOUT_MS = 1000;

interface ParentScreensProps {
	state: { key: string; index: number; routes: PartialRoute[] };
	navigation: {
		dispatch: (action: {
			type: "RESET";
			payload: object;
			target: string;
		}) => void;
	};
	parents: readonly string[];
	root?: string;
	children: ReactNode;
}

/**
 * A stack's `layout`: when the stack opens on a deep link, the screens above
 * the anchor get their parent screens below them, so back goes up a level,
 * and a stack that opened on another route gets its `root` screen first.
 * Only the state the stack opens with changes.
 */
export function ParentScreens({
	state,
	navigation,
	parents,
	root,
	children,
}: ParentScreensProps) {
	const [opened] = useState(() => {
		const routes = withParentRoutes(state.routes, parents, root);
		if (routes.length === state.routes.length) return null;
		const focused = state.routes[state.index] as PartialRoute;
		return {
			state,
			payload: { ...state, routes, index: routes.indexOf(focused) },
		};
	});
	const reset = useRef(false);
	useLayoutEffect(() => {
		if (!opened || reset.current) return;
		reset.current = true;
		navigation.dispatch({
			type: "RESET",
			payload: opened.payload,
			target: opened.state.key,
		});
	}, [navigation, opened]);
	const [gaveUp, setGaveUp] = useState(false);
	useEffect(() => {
		if (!opened) return;
		const timer = setTimeout(() => setGaveUp(true), RESET_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [opened]);
	// A native stack cannot put a screen below a sheet it already shows, so it
	// first mounts on the state with the parents in it.
	if (opened && state === opened.state && !gaveUp) return null;
	return <>{children}</>;
}
