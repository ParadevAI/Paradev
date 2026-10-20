import type {
	PagePresenceViewer,
	PresenceVisitor,
} from "@superset/shared/page-presence";

/** Signed-in visitors, then the guests here now, who leave no visit behind. */
export function withGuests(
	visitors: PresenceVisitor[],
	viewers: PagePresenceViewer[],
	guestName: (guestNumber: number | null) => string,
	now: number,
): PresenceVisitor[] {
	const seen = new Set<string>();
	const guests = viewers.flatMap((viewer) => {
		if (!viewer.guest || seen.has(viewer.key)) return [];
		seen.add(viewer.key);
		return [
			{
				userId: `guest:${viewer.key}`,
				name: guestName(viewer.guestNumber),
				image: null,
				lastSeenAt: now,
				active: true,
			},
		];
	});
	return guests.length === 0 ? visitors : [...visitors, ...guests];
}
