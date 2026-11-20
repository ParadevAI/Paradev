// The stored `expiresAt` is fixed at sign-in, but the server extends the
// session on use, so only the server can say whether the token still works.
export function storedTokenToRestore(
	stored: { token: string | null; expiresAt: string | null } | undefined,
): string | null {
	return stored?.token || null;
}
