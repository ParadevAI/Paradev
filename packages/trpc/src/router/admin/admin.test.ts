import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const SRC = resolve(import.meta.dir, "../..");
const WAKE_PATH = resolve(SRC, "router/cloud-workspace/wake.ts");
const SANDBOX_PROVIDER = resolve(SRC, "lib/sandbox/vercel.ts");
const STARTS_A_BOX =
	/\b(wakeCloudWorkspace|restartCloudWorkspace|wakeAfterStop|wakeSandbox|provisionSandbox|topUpSandboxSession|getSandboxToWake)\(/;

const transpilers = {
	ts: new Bun.Transpiler({ loader: "ts" }),
	tsx: new Bun.Transpiler({ loader: "tsx" }),
};

function resolveImport(from: string, specifier: string): string | null {
	if (!specifier.startsWith(".")) return null;
	const base = resolve(dirname(from), specifier);
	return (
		[`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base].find(
			(path) => /\.tsx?$/.test(path) && existsSync(path),
		) ?? null
	);
}

function reachableFrom(entries: string[]): Set<string> {
	const reached = new Set<string>();
	const pending = [...entries];
	for (let file = pending.pop(); file; file = pending.pop()) {
		if (reached.has(file)) continue;
		reached.add(file);
		const transpiler = file.endsWith(".tsx") ? transpilers.tsx : transpilers.ts;
		for (const { path } of transpiler.scanImports(readFileSync(file, "utf8"))) {
			const target = resolveImport(file, path);
			if (target) pending.push(target);
		}
	}
	return reached;
}

const staffEntries = [
	...new Bun.Glob("router/**/*.ts").scanSync({ cwd: SRC, absolute: true }),
]
	.filter((file) => !file.endsWith(".test.ts"))
	.filter(
		(file) =>
			/\/router\/(admin|support)\//.test(file) ||
			readFileSync(file, "utf8").includes("adminProcedure"),
	);

describe("staff tooling", () => {
	test("can never start a customer's box", () => {
		expect(staffEntries.length).toBeGreaterThan(1);
		const reached = reachableFrom(staffEntries);
		expect(reached.has(WAKE_PATH)).toBe(false);
		const starters = [...reached]
			.filter((file) => file !== SANDBOX_PROVIDER)
			.filter((file) => STARTS_A_BOX.test(readFileSync(file, "utf8")))
			.map((file) => relative(SRC, file));
		expect(starters).toEqual([]);
	});
});
