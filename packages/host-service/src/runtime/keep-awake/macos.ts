import { execFile, spawn } from "node:child_process";
import type { KeepAwakeLease } from "./controller";

export function isKeepAwakeSupported(
	platform: NodeJS.Platform = process.platform,
	runMode = process.env.SUPERSET_HOST_RUN_MODE,
): boolean {
	return platform === "darwin" && runMode !== "sandbox";
}

export function powerAllowsKeepAwake(output: string): boolean {
	if (/^Now drawing from 'AC Power'$/m.test(output)) return true;
	if (!/^Now drawing from 'Battery Power'$/m.test(output)) return false;
	const percentages = [...output.matchAll(/(?:^|[\t ])(\d{1,3})%;/gm)].map(
		(match) => Number(match[1]),
	);
	return (
		percentages.length > 0 &&
		percentages.every((percentage) => percentage >= 10 && percentage <= 100)
	);
}

export function readMacPower(signal: AbortSignal): Promise<boolean> {
	return new Promise((resolve, reject) => {
		execFile(
			"/usr/bin/pmset",
			["-g", "batt"],
			{
				encoding: "utf8",
				timeout: 2_000,
				maxBuffer: 16 * 1024,
				signal,
				env: { ...process.env, LC_ALL: "C" },
			},
			(error, stdout) => {
				if (error) reject(error);
				else resolve(powerAllowsKeepAwake(stdout));
			},
		);
	});
}

export function startMacKeepAwakeLease(): KeepAwakeLease {
	const child = spawn(
		"/usr/bin/caffeinate",
		["-i", "-w", String(process.pid), "-t", "90"],
		{ stdio: "ignore" },
	);
	let running = true;
	child.once("error", (error) => {
		running = false;
		console.warn("[keep-awake] could not start caffeinate", error);
	});
	child.once("exit", () => {
		running = false;
	});
	child.unref();
	if (child.pid === undefined) throw new Error("Could not start caffeinate");
	return {
		isRunning: () => running,
		stop() {
			if (!running) return;
			running = false;
			child.kill();
		},
	};
}
