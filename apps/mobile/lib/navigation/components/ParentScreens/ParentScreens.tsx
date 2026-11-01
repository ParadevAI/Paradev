import { type ReactNode, useEffect, useRef } from "react";
import { type PartialRoute, withParentRoutes } from "../../parentRoutes";

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
	children: ReactNode;
}

/**
 * A stack's `layout`: when the stack opens on a deep link, the screens above
 * the anchor get their parent screens below them, so back goes up a level.
 * Only the state the stack opens with changes.
 */
export function ParentScreens({
	state,
	navigation,
	parents,
	children,
}: ParentScreensProps) {
	const opened = useRef<typeof state | null>(state);
	useEffect(() => {
		const initial = opened.current;
		opened.current = null;
		if (!initial) return;
		const routes = withParentRoutes(initial.routes, parents);
		if (routes.length === initial.routes.length) return;
		const focused = initial.routes[initial.index] as PartialRoute;
		navigation.dispatch({
			type: "RESET",
			payload: { ...initial, routes, index: routes.indexOf(focused) },
			target: initial.key,
		});
	}, [navigation, parents]);
	return <>{children}</>;
}
