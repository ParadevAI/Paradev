import { useCallback, useEffect, useRef, useState } from "react";

function scrollParentFits(element: HTMLElement): boolean {
	const viewport = element.parentElement;
	return !viewport || viewport.scrollHeight <= viewport.clientHeight + 1;
}

export function useLoadOlderOnReach({
	hasOlder,
	onLoadOlder,
	eager = false,
}: {
	hasOlder: boolean;
	onLoadOlder: () => Promise<boolean>;
	/** Page everything in without waiting for the reader to reach the top. */
	eager?: boolean;
}) {
	const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
	const [loading, setLoading] = useState(false);
	const [failed, setFailed] = useState(false);
	const leftView = useRef(false);

	const load = useCallback(() => {
		setLoading(true);
		void onLoadOlder()
			.catch(() => false)
			.then((loaded) => {
				setLoading(false);
				if (!loaded) setFailed(true);
			});
	}, [onLoadOlder]);

	useEffect(() => {
		if (!eager || !hasOlder || loading || failed) return;
		load();
	}, [eager, hasOlder, loading, failed, load]);

	useEffect(() => {
		if (!sentinel || !hasOlder || loading || failed) return;
		let active = true;
		const observer = new IntersectionObserver((entries) => {
			if (!active) return;
			const visible = entries.some((entry) => entry.isIntersecting);
			if (!visible) {
				leftView.current = true;
				return;
			}
			if (!leftView.current && !scrollParentFits(sentinel)) return;
			active = false;
			leftView.current = false;
			observer.disconnect();
			load();
		});
		observer.observe(sentinel);
		return () => {
			active = false;
			observer.disconnect();
		};
	}, [sentinel, hasOlder, loading, failed, load]);

	return {
		sentinelRef: setSentinel,
		loading,
		failed,
		retry: () => {
			leftView.current = true;
			setFailed(false);
		},
	};
}
