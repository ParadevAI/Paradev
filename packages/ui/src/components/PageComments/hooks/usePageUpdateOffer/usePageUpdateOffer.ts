"use client";

import { useCallback, useRef, useState } from "react";
import { pageUpdateAction } from "../../utils/pageUpdateAction";
import { takeLatest } from "../../utils/takeLatest";

export interface PageUpdateCandidate {
	version: number;
	publishedBy: string | null | undefined;
}

/**
 * Decides what an open page does when the hub says a version was published:
 * swap to a version the viewer published, offer anyone else's.
 */
export function usePageUpdateOffer<Next extends PageUpdateCandidate>({
	check,
	apply,
	shownVersion,
	viewerId,
	paused = false,
}: {
	check: () => Promise<Next>;
	apply: (next: Next) => void;
	shownVersion: number | undefined;
	viewerId: string | null | undefined;
	paused?: boolean;
}) {
	const [offered, setOffered] = useState<Next | null>(null);
	const latest = useRef({ check, apply, shownVersion, viewerId, paused });
	latest.current = { check, apply, shownVersion, viewerId, paused };
	const track = useRef(takeLatest()).current;

	const onPublished = useCallback(async () => {
		if (latest.current.paused) return;
		let result: { value: Next; latest: boolean };
		try {
			result = await track(latest.current.check());
		} catch (error) {
			console.warn("[pages] could not check for a new version", error);
			return;
		}
		if (!result.latest || latest.current.paused) return;
		const next = result.value;
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
			setOffered(next);
		}
	}, [track]);

	const viewOffered = useCallback(() => {
		if (offered) latest.current.apply(offered);
		setOffered(null);
	}, [offered]);

	return {
		onPublished,
		offered: offered && offered.version !== shownVersion ? offered : null,
		viewOffered,
	};
}
