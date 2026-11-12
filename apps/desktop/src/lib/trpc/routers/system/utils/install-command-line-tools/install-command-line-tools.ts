export type InstallCommandLineToolsResult =
	| { status: "requested" }
	| { status: "already-installed" }
	| { status: "already-running" }
	| { status: "failed"; reason: string | null };

export interface InstallCommandLineToolsDeps {
	isInstallerRunning: () => Promise<boolean>;
	/** Runs `xcode-select --install`; rejects with `stderr` on a non-zero exit. */
	runXcodeSelectInstall: () => Promise<void>;
	bringInstallerToFront: () => Promise<void>;
}

function stderrOf(error: unknown): string {
	return error && typeof error === "object" && "stderr" in error
		? String(error.stderr)
		: "";
}

export async function installCommandLineTools(
	deps: InstallCommandLineToolsDeps,
): Promise<InstallCommandLineToolsResult> {
	if (await deps.isInstallerRunning()) {
		await deps.bringInstallerToFront();
		return { status: "already-running" };
	}
	try {
		await deps.runXcodeSelectInstall();
	} catch (error) {
		const stderr = stderrOf(error);
		// "xcode-select: error: command line tools are already installed, use
		// "Software Update" in System Settings to install updates"
		if (/already installed/i.test(stderr)) {
			return { status: "already-installed" };
		}
		if (/already (?:in progress|running|requested)/i.test(stderr)) {
			await deps.bringInstallerToFront();
			return { status: "already-running" };
		}
		const reason = stderr
			.split("\n")
			.map((line) => line.replace(/^xcode-select: (?:error|note): /, "").trim())
			.find(Boolean);
		return { status: "failed", reason: reason ?? null };
	}
	await deps.bringInstallerToFront();
	return { status: "requested" };
}
