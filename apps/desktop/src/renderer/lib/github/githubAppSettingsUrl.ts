/** The GitHub page where the App's repository access is chosen for one installation. */
export function githubAppSettingsUrl(installation: {
	installationId: string;
	accountLogin: string;
	accountType: string;
}): string {
	return installation.accountType === "Organization"
		? `https://github.com/organizations/${installation.accountLogin}/settings/installations/${installation.installationId}`
		: `https://github.com/settings/installations/${installation.installationId}`;
}
