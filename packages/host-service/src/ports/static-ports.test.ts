import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getLabelsForWorkspaces, invalidateLabelCache } from "./static-ports";

const dirs: string[] = [];

afterEach(() => {
	invalidateLabelCache();
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function worktreeWithPorts(ports: Array<{ port: number; label: string }>) {
	const dir = mkdtempSync(join(tmpdir(), "static-ports-"));
	dirs.push(dir);
	mkdirSync(join(dir, ".paradev"));
	writeFileSync(join(dir, ".paradev", "ports.json"), JSON.stringify({ ports }));
	return dir;
}

test("a workspace group takes labels from every workspace, first one wins", () => {
	const paths: Record<string, string> = {
		web: worktreeWithPorts([{ port: 3000, label: "Web" }]),
		api: worktreeWithPorts([
			{ port: 3000, label: "Not used" },
			{ port: 4100, label: "API" },
		]),
	};

	const labels = getLabelsForWorkspaces(
		(id) => paths[id] ?? null,
		["container", "web", "api"],
	);

	expect([...labels]).toEqual([
		[3000, "Web"],
		[4100, "API"],
	]);
});
