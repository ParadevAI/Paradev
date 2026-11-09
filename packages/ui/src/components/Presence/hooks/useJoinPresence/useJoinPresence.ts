"use client";

import { useEffect, useRef } from "react";
import { joinPresence, wakePresence } from "../../stores/presenceStore";

export function useJoinPresence({
	roomId,
	url,
	onPublished,
}: {
	roomId: string | undefined;
	url: (() => Promise<string | null>) | undefined;
	onPublished?: () => void;
}): void {
	const urlRef = useRef(url);
	urlRef.current = url;
	const onPublishedRef = useRef(onPublished);
	onPublishedRef.current = onPublished;
	const enabled = Boolean(roomId && url);

	useEffect(() => {
		if (!roomId || !enabled) return;
		const leave = joinPresence(
			roomId,
			async () => (await urlRef.current?.()) ?? null,
			() => onPublishedRef.current?.(),
		);
		const wake = () => {
			if (document.visibilityState === "visible") wakePresence();
		};
		window.addEventListener("online", wake);
		document.addEventListener("visibilitychange", wake);
		return () => {
			window.removeEventListener("online", wake);
			document.removeEventListener("visibilitychange", wake);
			leave();
		};
	}, [roomId, enabled]);
}
