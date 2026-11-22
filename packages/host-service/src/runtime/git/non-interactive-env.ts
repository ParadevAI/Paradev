/** Git Credential Manager reads GCM_INTERACTIVE: git work the user did not start must not open a sign-in window. */
export function withoutSignInPrompt(
	env: Record<string, string>,
): Record<string, string> {
	return { ...env, GCM_INTERACTIVE: "never" };
}
