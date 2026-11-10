import { spawn } from "node:child_process";
import type { AgentLoginProcess } from "../agent-sign-in";
import type { RunResult } from "../detect-coding-agent";

/** Runs with no stdin, so a CLI never waits on a prompt nobody can answer. */
export function runProcess(
	command: string,
	args: string[],
	options: { env: Record<string, string>; timeoutMs: number },
): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			env: options.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		child.stdout?.on("data", (data: Buffer) => {
			stdout += data.toString("utf8");
		});
		child.stderr?.resume();
		const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs);
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ code, stdout });
		});
	});
}

export function spawnLoginProcess(
	command: string,
	args: string[],
	env: Record<string, string>,
): AgentLoginProcess {
	const child = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] });
	const listeners: Array<(chunk: string) => void> = [];
	const forward = (data: Buffer) => {
		for (const listener of listeners) listener(data.toString("utf8"));
	};
	child.stdout?.on("data", forward);
	child.stderr?.on("data", forward);
	child.stdin?.on("error", () => {});
	const exited = new Promise<number | null>((resolve) => {
		child.on("error", () => resolve(null));
		child.on("close", (code) => resolve(code));
	});
	return {
		onOutput: (listener) => listeners.push(listener),
		write: (text) => child.stdin?.write(text),
		exited,
		kill: () => child.kill(),
	};
}
