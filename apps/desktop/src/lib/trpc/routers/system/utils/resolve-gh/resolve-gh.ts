export interface ResolvedGh {
	/** `gh`, or the absolute path of the copy the app installed. */
	command: string;
	versionOutput: string;
}

/**
 * The gh to run: the first on PATH when it works, else the app's copy by its
 * absolute path. A broken gh earlier on PATH (a brew gh with a dyld error)
 * would otherwise hide the one the app installed for sign-in and setup-git.
 */
export async function resolveGh({
	appGhPath,
	runVersion,
}: {
	appGhPath: string;
	runVersion: (command: string) => Promise<string>;
}): Promise<ResolvedGh | null> {
	for (const command of ["gh", appGhPath]) {
		try {
			return { command, versionOutput: await runVersion(command) };
		} catch {}
	}
	return null;
}
