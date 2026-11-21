"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { newestWins } from "../../utils/newestWins";
import { pageUpdateAction } from "../../utils/pageUpdateAction";

export interface PageUpdateCandidate {
	version: number;
	publishedBy: string | null | undefined;
}

/**
 * Decides what an open page does when the hub says a version was published:
 * swap to a version the viewer published, offer anyone else's.
 */
export function usePageUpdateOffer<Next extends PageUpdateCandidate>({
	pageKey,
	check,
	apply,
	shownVersion,
	viewerId,
	paused = false,
}: {
	pageKey: string | undefined;
	check: () => Promise<Next>;
	apply: (next: Next) => void;
	shownVersion: number | undefined;
	viewerId: string | null | undefined;
	paused?: boolean;
}) {
	const [offered, setOffered] = useState<{
		pageKey: string | undefined;
		shownVersion: number | undefined;
		next: Next;
	} | null>(null);
	const latest = useRef({
		pageKey,
		check,
		apply,
		shownVersion,
		viewerId,
		paused,
	});
	latest.current = { pageKey, check, apply, shownVersion, viewerId, paused };
	const order = useRef(newestWins()).current;
	const missedWhilePaused = useRef(false);
	const checking = useRef(false);
	const checkAgain = useRef(false);

	const onPublished = useCallback(async () => {
		if (latest.current.paused) {
			missedWhilePaused.current = true;
			return;
		}
		if (checking.current) {
			checkAgain.current = true;
			return;
		}
		const requestedFor = latest.current.pageKey;
		const ticket = order.issue();
		let next: Next;
		checking.current = true;
		try {
			next = await latest.current.check();
		} catch (error) {
			console.warn("[pages] could not check for a new version", error);
			return;
		} finally {
			checking.current = false;
			if (checkAgain.current) {
				checkAgain.current = false;
				void onPublished();
			}
		}
		if (latest.current.pageKey !== requestedFor) return;
		if (latest.current.paused) {
			missedWhilePaused.current = true;
			return;
		}
		if (!order.accept(ticket)) return;
		const action = pageUpdateAction({
			shownVersion: latest.current.shownVersion ?? next.version,
			nextVersion: next.version,
			publishedBy: next.publishedBy,
			viewerId: latest.current.viewerId,
		});
		if (action === "swap") {
			setOffered(null);
			latest.current.apply(next);
		} else if (action === "offer") {
			setOffered({
				pageKey: requestedFor,
				shownVersion: latest.current.shownVersion,
				next,
			});
		}
	}, [order]);

	useEffect(() => {
		setOffered((current) =>
			current &&
			(current.pageKey !== pageKey || current.shownVersion !== shownVersion)
				? null
				: current,
		);
	}, [pageKey, shownVersion]);

	useEffect(() => {
		if (paused || !missedWhilePaused.current) return;
		missedWhilePaused.current = false;
		void onPublished();
	}, [paused, onPublished]);

	const visible =
		offered &&
		offered.pageKey === pageKey &&
		offered.shownVersion === shownVersion
			? offered.next
			: null;

	const viewOffered = useCallback(() => {
		if (visible) latest.current.apply(visible);
		setOffered(null);
	}, [visible]);

	return { onPublished, offered: visible, viewOffered };
}
