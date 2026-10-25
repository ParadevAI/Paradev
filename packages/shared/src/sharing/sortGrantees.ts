import type { ShareGrantee } from "./types";

const KIND_ORDER: Record<ShareGrantee["kind"], number> = {
	user: 0,
	invitation: 1,
	team: 2,
};

export function sortGrantees<T extends Pick<ShareGrantee, "kind">>(
	grantees: readonly T[],
): T[] {
	return [...grantees].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}
