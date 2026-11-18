export function isIssuedBeforeCutoff(
	issuedAtSeconds: unknown,
	tokensValidAfter: Date | null,
): boolean {
	if (!tokensValidAfter) return false;
	if (typeof issuedAtSeconds !== "number") return true;
	return issuedAtSeconds * 1000 < tokensValidAfter.getTime();
}
