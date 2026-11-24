/** A machine can be a host in two organizations, so the key names both. */
export function hostTagFoldersQueryKey(
	machineId: string,
	organizationId: string,
) {
	return [
		"host-service",
		"tag-folders",
		"list",
		machineId,
		organizationId,
	] as const;
}
