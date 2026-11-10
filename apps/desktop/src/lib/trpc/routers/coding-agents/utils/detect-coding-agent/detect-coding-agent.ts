import path from "node:path";
import type { ManagedCodingAgent } from "@superset/agent-setup/managed-agent-binaries";

export interface CodingAgentStatus {
	installed: boolean;
	/** `path`: the user's own install, found on their PATH. `paradev`: the copy the app installed. */
	source: "path" | "paradev" | null;
	path: string | null;
	version: string | null;
	/** Null when not asked for, or when the agent could not say. */
	signedIn: boolean | null;
	account: string | null;
}

export interface RunResult {
	code: number | null;
	stdout: string;
}

export interface DetectCodingAgentDeps {
	userPath: () => Promise<string>;
	/** PATH entries that hold Paradev's agent wrappers, never a real agent. */
	wrapperDirs: string[];
	managedPath: string;
	isExecutable: (filePath: string) => boolean;
	run: (command: string, args: string[]) => Promise<RunResult>;
}

export function findOnPath(
	binary: string,
	pathValue: string,
	skipDirs: string[],
	isExecutable: (filePath: string) => boolean,
): string | null {
	const skipped = new Set(skipDirs.map((dir) => path.resolve(dir)));
	for (const dir of pathValue.split(path.delimiter)) {
		if (!dir || skipped.has(path.resolve(dir))) continue;
		const candidate = path.join(dir, binary);
		if (isExecutable(candidate)) return candidate;
	}
	return null;
}

export function parseAgentVersion(output: string): string | null {
	return output.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? null;
}

async function signInState(
	agent: ManagedCodingAgent,
	binaryPath: string,
	run: DetectCodingAgentDeps["run"],
): Promise<{ signedIn: boolean | null; account: string | null }> {
	try {
		if (agent === "claude") {
			const result = await run(binaryPath, ["auth", "status", "--json"]);
			const status = JSON.parse(result.stdout) as {
				loggedIn?: unknown;
				email?: unknown;
			};
			return {
				signedIn: status.loggedIn === true,
				account: typeof status.email === "string" ? status.email : null,
			};
		}
		const result = await run(binaryPath, ["login", "status"]);
		return { signedIn: result.code === 0, account: null };
	} catch {
		return { signedIn: null, account: null };
	}
}

/**
 * An install on the user's PATH always wins over the app's own copy. Nothing
 * runs the agent unless `signIn` asks, so detecting creates no agent files.
 */
export async function detectCodingAgent(
	agent: ManagedCodingAgent,
	options: { signIn: boolean },
	deps: DetectCodingAgentDeps,
): Promise<CodingAgentStatus> {
	const onPath = findOnPath(
		agent,
		await deps.userPath(),
		deps.wrapperDirs,
		deps.isExecutable,
	);
	const managed = deps.isExecutable(deps.managedPath) ? deps.managedPath : null;
	const binaryPath = onPath ?? managed;
	if (!binaryPath) {
		return {
			installed: false,
			source: null,
			path: null,
			version: null,
			signedIn: null,
			account: null,
		};
	}
	const version = await deps
		.run(binaryPath, ["--version"])
		.then((result) => parseAgentVersion(result.stdout))
		.catch(() => null);
	const signIn = options.signIn
		? await signInState(agent, binaryPath, deps.run)
		: { signedIn: null, account: null };
	return {
		installed: true,
		source: onPath ? "path" : "paradev",
		path: binaryPath,
		version,
		...signIn,
	};
}
