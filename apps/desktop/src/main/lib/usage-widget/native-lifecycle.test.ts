import { expect, test } from "bun:test";
import { join } from "node:path";

for (const [scenario, description] of [
	[
		"windows",
		"keeps native activation and isolated renderer settings for every usage window",
	],
	[
		"recovery",
		"recovers failed hover documents with bounded reloads and explicit OOM recovery",
	],
	[
		"ipc",
		"rejects foreign IPC senders and disposes windows, trays, listeners and timers",
	],
	[
		"appearance",
		"allows a healthy account color while refusing an expired sibling account",
	],
	["opt-in", "keeps automatic polling off while allowing explicit usage reads"],
]) {
	test(description ?? "native widget lifecycle", async () => {
		const child = Bun.spawn(
			[
				process.execPath,
				join(import.meta.dir, "native-lifecycle.fixture.ts"),
				scenario ?? "",
			],
			{
				cwd: join(import.meta.dir, "../../../.."),
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		expect(stderr).not.toContain("Unhandled");
		expect(code, `${stdout}\n${stderr}`).toBe(0);
		expect(stdout).toContain(`native-widget:${scenario}:passed`);
	});
}
