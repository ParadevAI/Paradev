import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useInboxSelectionStore } from "renderer/routes/_authenticated/_dashboard/stores/inboxSelectionStore";
import {
	afterSettle,
	moveSelection,
} from "renderer/routes/_authenticated/_dashboard/utils/inboxSelection";

const INBOX_ROUTE = /^\/inbox\/([^/]+)\/?$/;
const ROUTE_FOLLOW_MS = 500;

let routeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Selecting a row is opening it. The selection moves in the store at once, so
 * the list and the detail pane follow the key in the same frame; the route
 * follows when the selection rests, so a held key changes the route once.
 */
export function useInboxSelection() {
	const navigate = useNavigate();
	const select = useCallback(
		(itemId: string) => {
			useInboxSelectionStore.getState().setSelected(itemId);
			clearTimeout(routeTimer);
			routeTimer = setTimeout(() => {
				routeTimer = undefined;
				void navigate({ to: "/inbox/$cardId", params: { cardId: itemId } });
			}, ROUTE_FOLLOW_MS);
		},
		[navigate],
	);
	const move = useCallback(
		(step: 1 | -1) => {
			const { order, selectedId } = useInboxSelectionStore.getState();
			const next = moveSelection(order, selectedId, step);
			if (next && next !== selectedId) select(next);
		},
		[select],
	);
	/** Call before the settled row leaves the list: selects what comes after it. */
	const advanceFrom = useCallback(
		(itemId: string) => {
			const { order, selectedId } = useInboxSelectionStore.getState();
			if (itemId !== selectedId) return;
			const next = afterSettle(order, itemId);
			if (next) select(next);
		},
		[select],
	);
	return { select, move, advanceFrom };
}

/** Keeps the selection equal to the route when the route changes by any other means: a link, back and forward, a reload. */
export function useInboxRouteSelection() {
	const routeId = useRouterState({
		select: (state) => state.location.pathname.match(INBOX_ROUTE)?.[1] ?? null,
	});
	useEffect(() => {
		clearTimeout(routeTimer);
		routeTimer = undefined;
		useInboxSelectionStore.getState().setSelected(routeId);
	}, [routeId]);
}
