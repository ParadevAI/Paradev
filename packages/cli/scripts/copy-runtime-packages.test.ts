import { afterEach, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { copyPackagesWithDeps } from "./copy-runtime-packages";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "copy-runtime-")));
	dirs.push(dir);
	return dir;
}

/** A Bun isolated store: each package links its own dependency versions. */
function store(packages: Record<string, Record<string, string>>): string {
	const repoRoot = tempDir();
	const storeEntry = (id: string) => {
		const name = id.slice(0, id.lastIndexOf("@"));
		return join(repoRoot, "node_modules", ".bun", id, "node_modules", name);
	};
	for (const [id, deps] of Object.entries(packages)) {
		const dir = storeEntry(id);
		const at = id.lastIndexOf("@");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({
				name: id.slice(0, at),
				version: id.slice(at + 1),
				dependencies: deps,
			}),
		);
		for (const [dep, version] of Object.entries(deps)) {
			const link = join(dir, "..", dep);
			mkdirSync(dirname(link), { recursive: true });
			symlinkSync(storeEntry(`${dep}@${version}`), link);
		}
	}
	return repoRoot;
}

function linkTopLevel(repoRoot: string, ids: string[]): string {
	const app = join(repoRoot, "app");
	for (const id of ids) {
		const name = id.slice(0, id.lastIndexOf("@"));
		const link = join(app, "node_modules", name);
		mkdirSync(dirname(link), { recursive: true });
		symlinkSync(
			join(repoRoot, "node_modules", ".bun", id, "node_modules", name),
			link,
		);
	}
	return app;
}

function resolvedDir(from: string, dep: string): string {
	return dirname(
		createRequire(join(from, "package.json")).resolve(`${dep}/package.json`),
	);
}

function resolvedVersion(from: string, dep: string): string {
	return JSON.parse(
		readFileSync(join(resolvedDir(from, dep), "package.json"), "utf-8"),
	).version;
}

describe("copyPackagesWithDeps", () => {
	it("gives each package the dependency version it was installed with, in either order", () => {
		const repoRoot = store({
			"claude-acp@1.0.0": { sdk: "2.0.0", zod: "4.0.0" },
			"pi-acp@1.0.0": { sdk: "0.26.0", zod: "3.0.0" },
			"sdk@2.0.0": { zod: "4.0.0" },
			"sdk@0.26.0": { zod: "3.0.0" },
			"zod@4.0.0": {},
			"zod@3.0.0": {},
		});
		const app = linkTopLevel(repoRoot, ["claude-acp@1.0.0", "pi-acp@1.0.0"]);

		for (const order of [
			["claude-acp", "pi-acp"],
			["pi-acp", "claude-acp"],
		]) {
			const dest = join(tempDir(), "node_modules");
			copyPackagesWithDeps(order, app, repoRoot, dest);

			const claude = join(dest, "claude-acp");
			const pi = join(dest, "pi-acp");
			expect(resolvedVersion(claude, "sdk")).toBe("2.0.0");
			expect(resolvedVersion(claude, "zod")).toBe("4.0.0");
			expect(resolvedVersion(pi, "sdk")).toBe("0.26.0");
			expect(resolvedVersion(pi, "zod")).toBe("3.0.0");
			expect(resolvedVersion(resolvedDir(pi, "sdk"), "zod")).toBe("3.0.0");
		}
	});

	it("does not let a dependency copied later shadow one a nested package resolved", () => {
		const repoRoot = store({
			"q@1.0.0": {},
			"p@1.0.0": { q: "2.0.0", y: "2.0.0" },
			"q@2.0.0": { y: "1.0.0" },
			"y@1.0.0": {},
			"y@2.0.0": {},
		});
		const app = linkTopLevel(repoRoot, ["q@1.0.0", "p@1.0.0"]);
		const dest = join(tempDir(), "node_modules");

		copyPackagesWithDeps(["q", "p"], app, repoRoot, dest);

		const p = join(dest, "p");
		expect(resolvedVersion(p, "q")).toBe("2.0.0");
		expect(resolvedVersion(p, "y")).toBe("2.0.0");
		expect(resolvedVersion(resolvedDir(p, "q"), "y")).toBe("1.0.0");
	});
});
