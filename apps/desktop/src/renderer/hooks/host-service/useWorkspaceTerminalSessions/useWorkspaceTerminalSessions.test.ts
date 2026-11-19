import { expect, test } from "bun:test";

const RENDERER_ROOT = `${import.meta.dir}/../../..`;
const LIST_QUERY = /terminal\s*\.\s*list\s*\.\s*useQuery\b/;

test("only useWorkspaceTerminalSessions subscribes to terminal.list, so every reader refreshes on host terminal events", async () => {
	const readers: string[] = [];
	for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan(RENDERER_ROOT)) {
		if (/\.test\.tsx?$/.test(path)) continue;
		const source = await Bun.file(`${RENDERER_ROOT}/${path}`).text();
		if (LIST_QUERY.test(source)) readers.push(path);
	}
	expect(readers).toEqual([
		"hooks/host-service/useWorkspaceTerminalSessions/useWorkspaceTerminalSessions.ts",
	]);
});
