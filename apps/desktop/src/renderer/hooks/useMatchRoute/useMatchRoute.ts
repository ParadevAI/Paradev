import {
	useRouterState,
	useMatchRoute as useStableMatchRoute,
} from "@tanstack/react-router";
import { useMemo } from "react";

/**
 * The router's `useMatchRoute` returns one stable function, so React Compiler
 * caches `matchRoute(...)` results and never recomputes them after navigation.
 * This returns a new function on each route change.
 */
export function useMatchRoute(): ReturnType<typeof useStableMatchRoute> {
	"use no memo";
	const matchRoute = useStableMatchRoute();
	const routeKey = useRouterState({
		select: (state) =>
			`${state.location.href}|${state.resolvedLocation?.href}|${state.status}`,
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: routeKey changes the function identity on navigation
	return useMemo(
		() => ((opts) => matchRoute(opts)) as typeof matchRoute,
		[matchRoute, routeKey],
	);
}
