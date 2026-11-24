export function isLinuxDesktop(userAgent: string | null): boolean {
	return (
		userAgent !== null &&
		/Linux/i.test(userAgent) &&
		!/Android/i.test(userAgent)
	);
}
