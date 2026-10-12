import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIError } from "@superset/cli-framework";
import { shellQuote } from "../shell-quote";

export interface SshResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * One multiplexed SSH connection for a whole setup run. The first connect is
 * interactive, so passwords, MFA and host-key prompts reach the user once;
 * every later command reuses it in batch mode.
 */
export class SshSession {
	private constructor(
		readonly target: string,
		private readonly controlDir: string,
	) {}

	private get controlPath(): string {
		return join(this.controlDir, "cm");
	}

	static async open(target: string): Promise<SshSession> {
		// A short path: a unix socket path is limited to about 100 bytes.
		const controlDir = mkdtempSync(
			join(process.platform === "darwin" ? "/tmp" : tmpdir(), "superset-ssh-"),
		);
		const session = new SshSession(target, controlDir);
		const child = Bun.spawn(
			[
				"ssh",
				"-o",
				"ControlMaster=yes",
				"-o",
				`ControlPath=${session.controlPath}`,
				"-o",
				"ControlPersist=300",
				"-o",
				"ServerAliveInterval=15",
				"-o",
				"ServerAliveCountMax=4",
				target,
				"true",
			],
			{ stdin: "inherit", stdout: "inherit", stderr: "inherit" },
		);
		const exitCode = await child.exited;
		if (exitCode !== 0) {
			rmSync(controlDir, { recursive: true, force: true });
			throw new CLIError(
				`Could not connect to ${target} over SSH`,
				`Check access first with: ssh ${target}. If it asks for a key passphrase, load the key with ssh-add.`,
			);
		}
		return session;
	}

	private args(tty: boolean, script: string): string[] {
		return [
			"ssh",
			"-o",
			`ControlPath=${this.controlPath}`,
			"-o",
			"ControlMaster=no",
			"-o",
			"BatchMode=yes",
			...(tty ? ["-t"] : []),
			this.target,
			`sh -c ${shellQuote(script)}`,
		];
	}

	/** Runs a POSIX sh script on the remote and captures its output. */
	async run(script: string, stdin?: string): Promise<SshResult> {
		const child = Bun.spawn(this.args(false, script), {
			stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		return { exitCode, stdout, stderr };
	}

	/**
	 * Runs a script with the remote output shown live on stderr, keeping
	 * stdout for this command's result, and a TTY when asked.
	 */
	async stream(script: string, { tty = false } = {}): Promise<number> {
		const child = Bun.spawn(this.args(tty, script), {
			stdin: tty ? "inherit" : "ignore",
			stdout: 2,
			stderr: "inherit",
		});
		return child.exited;
	}

	async close(): Promise<void> {
		await Bun.spawn(
			[
				"ssh",
				"-o",
				`ControlPath=${this.controlPath}`,
				"-O",
				"exit",
				this.target,
			],
			{ stdin: "ignore", stdout: "ignore", stderr: "ignore" },
		).exited;
		rmSync(this.controlDir, { recursive: true, force: true });
	}
}
