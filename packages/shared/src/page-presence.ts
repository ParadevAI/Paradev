export interface PagePresenceViewer {
	id: string;
	key: string;
	name: string;
	image: string | null;
	guest: boolean;
	guestNumber: number | null;
	color: number;
}

/** A signed-in person who has opened the page or workspace; `lastSeenAt` is epoch ms. */
export interface PresenceVisitor {
	userId: string;
	name: string;
	image: string | null;
	lastSeenAt: number;
	active: boolean;
}

export const MAX_PAGE_GUESTS = 20;
export const MAX_PRESENCE_VISITORS = 50;

export const PRESENCE_COLOR_COUNT = 8;

/** Visitors first, then the guests here now. A guest gets no visitor list, so everyone present counts for them. */
export function presencePeople(
	visitors: PresenceVisitor[],
	viewers: PagePresenceViewer[],
	guestName: (guestNumber: number | null) => string,
	now: number,
): PresenceVisitor[] {
	const seen = new Set<string>();
	const present = viewers.flatMap((viewer) => {
		if (seen.has(viewer.key)) return [];
		seen.add(viewer.key);
		if (viewer.guest) {
			return [
				{
					userId: `guest:${viewer.key}`,
					name: guestName(viewer.guestNumber),
					image: null,
					lastSeenAt: now,
					active: true,
				},
			];
		}
		if (visitors.length > 0) return [];
		return [
			{
				userId: `viewer:${viewer.key}`,
				name: viewer.name,
				image: viewer.image,
				lastSeenAt: now,
				active: true,
			},
		];
	});
	return present.length === 0 ? visitors : [...visitors, ...present];
}

export function presenceViewersFrom(raw: unknown): PagePresenceViewer[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((viewer) =>
		typeof viewer?.id === "string" &&
		typeof viewer.key === "string" &&
		typeof viewer.name === "string"
			? [
					{
						id: viewer.id,
						key: viewer.key,
						name: viewer.name,
						guest: viewer.guest === true,
						guestNumber:
							Number.isInteger(viewer.guestNumber) && viewer.guestNumber > 0
								? viewer.guestNumber
								: null,
						color: Number.isInteger(viewer.color) ? viewer.color : 0,
						image:
							typeof viewer.image === "string" &&
							viewer.image.startsWith("https:")
								? viewer.image
								: null,
					},
				]
			: [],
	);
}

export function presenceVisitorsFrom(raw: unknown): PresenceVisitor[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((visitor) =>
		typeof visitor?.userId === "string" &&
		typeof visitor.name === "string" &&
		typeof visitor.lastSeenAt === "number"
			? [
					{
						userId: visitor.userId,
						name: visitor.name,
						lastSeenAt: visitor.lastSeenAt,
						active: visitor.active === true,
						image:
							typeof visitor.image === "string" &&
							visitor.image.startsWith("https:")
								? visitor.image
								: null,
					},
				]
			: [],
	);
}

export function pagePresenceUrl({
	realtimeUrl,
	pageId,
	token,
	guestId,
}: {
	realtimeUrl: string;
	pageId: string;
	token?: string;
	guestId?: string;
}): string {
	const url = new URL(
		`/v2/page/${encodeURIComponent(pageId)}/presence`,
		realtimeUrl.replace(/^http/, "ws"),
	);
	if (token) url.searchParams.set("token", token);
	if (guestId) url.searchParams.set("guest", guestId);
	return url.toString();
}
