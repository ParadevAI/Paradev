interface SocialSignInResult {
	error: { message?: string; statusText?: string } | null;
}

/** better-auth reports a failed sign-in in `res.error`; it does not throw. */
export async function signInSocial<TParams>(
	social: (params: TParams) => Promise<SocialSignInResult>,
	params: TParams,
): Promise<void> {
	const res = await social(params);
	if (res.error) {
		throw new Error(res.error.message || res.error.statusText);
	}
}
