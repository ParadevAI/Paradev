"use client";

import { type RefObject, useEffect } from "react";
import { unavailableToolsListener } from "./utils/unavailableToolsListener";

export function usePageToolsUnavailable({
	frameRef,
	frameOrigin,
	signedIn,
}: {
	frameRef: RefObject<HTMLIFrameElement | null>;
	frameOrigin: string;
	signedIn: boolean;
}): void {
	useEffect(() => {
		const onMessage = unavailableToolsListener(
			frameOrigin,
			() => frameRef.current?.contentWindow,
			signedIn,
		);
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [frameOrigin, frameRef, signedIn]);
}
