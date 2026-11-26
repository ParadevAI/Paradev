"use client";

import { useEffect, useState } from "react";

import { canTrack, onConsentChange } from "@/lib/analytics/consent";

export function useCanTrack(): boolean {
	const [allowed, setAllowed] = useState(false);
	useEffect(() => {
		const update = () => setAllowed(canTrack());
		update();
		return onConsentChange(update);
	}, []);
	return allowed;
}
