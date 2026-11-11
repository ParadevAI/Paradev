import { spawn } from "node:child_process";

export interface RunResult {
	code: number | null;
	stdout: string;
}

/**
 * Runs with no stdin, so a CLI never waits on a prompt nobody can answer.
 * The child is killed when `signal` aborts, e.g. when an install is cancelled.
 */
export function runProcess(
	command: string,
	args: string[],
	options: {
		env: Record<string, string>;
		timeoutMs: number;
		signal?: AbortSignal;
	},
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
		const kill = () => child.kill("SIGKILL");
		const timer = setTimeout(kill, options.timeoutMs);
		options.signal?.addEventListener("abort", kill, { once: true });
		const settle = () => {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", kill);
		};
		child.on("error", (error) => {
			settle();
			reject(error);
		});
		child.on("close", (code) => {
			settle();
			resolve({ code, stdout });
		});
	});
}
