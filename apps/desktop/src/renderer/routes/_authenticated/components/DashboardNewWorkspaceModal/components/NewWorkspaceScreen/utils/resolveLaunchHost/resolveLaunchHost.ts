/** Host state never changes the answer; an unusable host is a blocker. */
export function resolveLaunchHost({
	intentHostId,
	savedHostId,
	machineId,
}: {
	intentHostId: string | null;
	savedHostId: string | null;
	machineId: string | null;
}): string | null {
	return intentHostId ?? savedHostId ?? machineId;
}
