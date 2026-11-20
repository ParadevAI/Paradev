/** Cloud keeps one sign-in per agent, labelled with the account email it was saved for. */
export function isAccountInCloud({
	email,
	cloudAccountLabel,
	cloudConfigured,
}: {
	email: string | null;
	cloudAccountLabel: string | null;
	cloudConfigured: boolean;
}): boolean {
	return (
		cloudConfigured &&
		!!email &&
		!!cloudAccountLabel &&
		email.toLowerCase() === cloudAccountLabel.toLowerCase()
	);
}
