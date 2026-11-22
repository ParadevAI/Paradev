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
