import { parseGhDeviceCode } from "../parse-gh-device-code";

export type GhAuthLoginEvent =
	| { type: "code"; code: string; url: string }
	| { type: "done" }
	| { type: "failed" };

export interface GhProcess {
	onOutput: (listener: (chunk: string) => void) => void;
	exited: Promise<number | null>;
	kill: () => void;
}

export interface GhAuthLoginDeps {
	hasUsableGit: () => Promise<boolean>;
	toolEnv: () => Promise<Record<string, string>>;
	/** A directory holding a `git` that exits 1, for gh to find before Apple's stub. */
	gitShimDir: () => Promise<string>;
	runGh: (args: string[]) => Promise<void>;
	spawnGh: (args: string[], env: Record<string, string>) => GhProcess;
	isGitSetupPending: () => Promise<boolean>;
	setGitSetupPending: (pending: boolean) => Promise<void>;
}

const LOGIN_BASE_ARGS = ["auth", "login", "--hostname", "github.com", "--web"];
const SETUP_GIT_ARGS = ["auth", "setup-git", "--hostname", "github.com"];

/**
 * With `--git-protocol https`, gh also sets up git's credential helper after
 * sign-in. Without usable git, sign in as ssh and switch gh back to https
 * right after.
 */
export function ghLoginArgs(gitUsable: boolean): string[] {
	return gitUsable
		? [...LOGIN_BASE_ARGS, "--git-protocol", "https", "--skip-ssh-key"]
		: [...LOGIN_BASE_ARGS, "--git-protocol", "ssh", "--skip-ssh-key"];
}

export function withPathFirst(
	env: Record<string, string>,
	dir: string,
): Record<string, string> {
	const key =
		Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
	return { ...env, [key]: [dir, env[key]].filter(Boolean).join(":") };
}

export function runGhAuthLogin(
	onEvent: (event: GhAuthLoginEvent) => void,
	deps: GhAuthLoginDeps,
): () => void {
	let stopped = false;
	let child: GhProcess | null = null;
	const emit = (event: GhAuthLoginEvent) => {
		if (!stopped) onEvent(event);
	};

	void (async () => {
		const gitUsable = await deps.hasUsableGit();
		const env = await deps.toolEnv();
		// gh asks git for its credential helper before it prints the code,
		// whatever the protocol.
		const loginEnv = gitUsable
			? env
			: withPathFirst(env, await deps.gitShimDir());
		if (stopped) return;
		child = deps.spawnGh(ghLoginArgs(gitUsable), loginEnv);
		let output = "";
		let sentCode = false;
		child.onOutput((chunk) => {
			if (sentCode) return;
			output = (output + chunk).slice(-4096);
			const parsed = parseGhDeviceCode(output);
			if (parsed) {
				sentCode = true;
				emit({ type: "code", ...parsed });
			}
		});
		const exitCode = await child.exited;
		if (stopped) return;
		if (exitCode !== 0) {
			emit({ type: "failed" });
			return;
		}
		if (gitUsable) {
			await deps.runGh(SETUP_GIT_ARGS).catch(() => {});
		} else {
			await deps
				.runGh(["config", "set", "-h", "github.com", "git_protocol", "https"])
				.catch(() => {});
			await deps.setGitSetupPending(true).catch(() => {});
		}
		emit({ type: "done" });
	})().catch(() => emit({ type: "failed" }));

	return () => {
		stopped = true;
		child?.kill();
	};
}

type GitSetupDeps = Pick<
	GhAuthLoginDeps,
	"hasUsableGit" | "runGh" | "isGitSetupPending" | "setGitSetupPending"
>;

/** Makes gh git's credential helper. Fails when gh is not signed in. */
export async function setUpGitCredentials(
	deps: GitSetupDeps,
): Promise<boolean> {
	if (!(await deps.hasUsableGit())) return false;
	try {
		await deps.runGh(SETUP_GIT_ARGS);
	} catch {
		return false;
	}
	await deps.setGitSetupPending(false);
	return true;
}

/** Sets up git credentials once git works, after a git-free sign-in. */
export async function finishPendingGitSetup(
	deps: GitSetupDeps,
): Promise<boolean> {
	if (!(await deps.isGitSetupPending())) return false;
	return setUpGitCredentials(deps);
}
