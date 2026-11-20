export function shouldOfferCloudSignIn({
	cloudPresetId,
	credentialsLoaded,
	configured,
	declined,
}: {
	cloudPresetId: string | null;
	credentialsLoaded: boolean;
	configured: boolean;
	declined: readonly string[];
}): boolean {
	if (!cloudPresetId || !credentialsLoaded || configured) return false;
	return !declined.includes(cloudPresetId);
}
