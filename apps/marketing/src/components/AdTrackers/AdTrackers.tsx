"use client";

import { useEffect } from "react";

import { useCanTrack } from "@/hooks/useCanTrack";
import { scheduleAdTrackers } from "@/lib/analytics/ad-trackers";

export function AdTrackers() {
	const enabled = useCanTrack();
	useEffect(() => (enabled ? scheduleAdTrackers() : undefined), [enabled]);
	return null;
}
