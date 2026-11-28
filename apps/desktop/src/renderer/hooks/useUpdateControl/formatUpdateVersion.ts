/** Drops the canary timestamp: "1.14.1-canary.20260711221936" becomes "1.14.1-canary". */
export function formatUpdateVersion(version: string): string {
	const [base, prereleaseTag] = version.split("-", 2);
	return prereleaseTag ? `${base}-${prereleaseTag.split(".")[0]}` : base;
}
