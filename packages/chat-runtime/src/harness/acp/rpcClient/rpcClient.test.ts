import { describe, expect, it } from "bun:test";
import { spawnAcpTransport } from "./rpcClient";

const AGENT_WITH_CHILD = `
const { spawn } = require("node:child_process");
const child = spawn("sleep", ["30"], { stdio: "ignore" });
process.stdout.write(JSON.stringify({ childPid: child.pid }) + "\\n");
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
`;

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function waitUntil(condition: () => boolean): Promise<boolean> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (condition()) return true;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	return condition();
}

describe.skipIf(process.platform === "win32")("spawnAcpTransport", () => {
	it("kills the processes the agent started when it closes", async () => {
		let childPid: number | undefined;
		const transport = spawnAcpTransport(
			{ command: process.execPath, args: ["-e", AGENT_WITH_CHILD] },
			{
				onLine: (line) => {
					childPid = (JSON.parse(line) as { childPid: number }).childPid;
				},
				onStderr: () => undefined,
				onExit: () => undefined,
			},
		);
		expect(await waitUntil(() => childPid !== undefined)).toBe(true);

		await transport.close();

		expect(await waitUntil(() => !alive(childPid as number))).toBe(true);
	});

	it("reports a command that cannot start as an exit", async () => {
		const stderr: string[] = [];
		const exited = new Promise<void>((resolve) => {
			spawnAcpTransport(
				{ command: "/nonexistent/acp-agent" },
				{
					onLine: () => undefined,
					onStderr: (chunk) => stderr.push(chunk),
					onExit: () => resolve(),
				},
			);
		});

		await exited;

		expect(stderr.join("")).toContain("ENOENT");
	});
});
