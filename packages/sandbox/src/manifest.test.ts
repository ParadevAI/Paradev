import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type Assets,
	deriveStepVersions,
	discardingSteps,
	loadSteps,
	renderAssetsTsv,
	renderStepsTsv,
	renderToolsTsv,
	sha256,
	upstreamSteps,
	walkRootfs,
} from "./manifest";

function fixture() {
	const dir = mkdtempSync(join(tmpdir(), "sandbox-manifest-"));
	const rootfs = join(dir, "rootfs");
	mkdirSync(join(rootfs, "usr", "local", "bin"), { recursive: true });
	mkdirSync(join(rootfs, "etc", "superset"), { recursive: true });
	writeFileSync(
		join(rootfs, "usr", "local", "bin", "tool"),
		"#!/bin/sh\necho hi\n",
	);
	chmodSync(join(rootfs, "usr", "local", "bin", "tool"), 0o755);
	writeFileSync(join(rootfs, "etc", "superset", "contract.sh"), "A='1'\n");
	const steps = join(dir, "steps");
	mkdirSync(steps);
	writeFileSync(join(steps, "one.sh"), "echo one\n");
	writeFileSync(join(steps, "two.sh"), "echo two\n");
	const assets: Assets = {
		thing: {
			sha256: "a".repeat(64),
			suffix: ".tar.gz",
			dest: "/usr/local/share/superset/media/thing.tar.gz",
			mode: "0644",
		},
	};
	return { dir, rootfs, steps, assets };
}

describe("walkRootfs", () => {
	test("one row per file, executable bit becomes 0755, destination is the absolute path", () => {
		const { rootfs } = fixture();
		const rows = walkRootfs(rootfs);
		expect(rows.map((r) => [r.dest, r.mode])).toEqual([
			["/etc/superset/contract.sh", "0644"],
			["/usr/local/bin/tool", "0755"],
		]);
		expect(rows[1]?.sha256).toBe(sha256("#!/bin/sh\necho hi\n"));
		expect(rows[0]?.source).toBe("rootfs/etc/superset/contract.sh");
	});

	test("tsv rows carry base64 paths so a space cannot split a column", () => {
		const { rootfs } = fixture();
		const tsv = renderToolsTsv(walkRootfs(rootfs));
		const [first] = tsv.trim().split("\n");
		const [mode, hash, src, dest] = (first ?? "").split("\t");
		expect(mode).toBe("0644");
		expect(hash).toHaveLength(64);
		expect(Buffer.from(src ?? "", "base64").toString()).toBe(
			"rootfs/etc/superset/contract.sh",
		);
		expect(Buffer.from(dest ?? "", "base64").toString()).toBe(
			"/etc/superset/contract.sh",
		);
	});
});

describe("deriveStepVersions", () => {
	const build = (overrides: {
		one?: string;
		two?: string;
		assetSha?: string;
		salt?: string;
		contract?: string;
	}) => {
		const f = fixture();
		if (overrides.one) writeFileSync(join(f.steps, "one.sh"), overrides.one);
		if (overrides.two) writeFileSync(join(f.steps, "two.sh"), overrides.two);
		if (overrides.contract)
			writeFileSync(
				join(f.rootfs, "etc", "superset", "contract.sh"),
				overrides.contract,
			);
		const assets: Assets = overrides.assetSha
			? {
					thing: {
						...(f.assets.thing as Assets[string]),
						sha256: overrides.assetSha,
					},
				}
			: f.assets;
		return deriveStepVersions({
			steps: [
				{ name: "one", assets: ["thing"], after: [], inputs: [], salt: "" },
				{
					name: "two",
					assets: [],
					after: ["one"],
					inputs: ["/etc/superset/contract.sh"],
					salt: overrides.salt ?? "",
				},
			],
			assets,
			tools: walkRootfs(f.rootfs),
			stepsDir: f.steps,
		});
	};

	test("is stable across builds of the same tree", () => {
		expect(build({}).map((s) => s.version)).toEqual(
			build({}).map((s) => s.version),
		);
	});

	test("a changed script moves only that step and its dependants", () => {
		const base = build({});
		const changed = build({ two: "echo two!\n" });
		expect(changed[0]?.version).toBe(base[0]?.version);
		expect(changed[1]?.version).not.toBe(base[1]?.version);
	});

	test("a changed asset moves the consuming step and everything after it", () => {
		const base = build({});
		const changed = build({ assetSha: "b".repeat(64) });
		expect(changed[0]?.version).not.toBe(base[0]?.version);
		expect(changed[1]?.version).not.toBe(base[1]?.version);
	});

	test("a changed input file moves the step that declares it", () => {
		const base = build({});
		const changed = build({ contract: "A='2'\n" });
		expect(changed[0]?.version).toBe(base[0]?.version);
		expect(changed[1]?.version).not.toBe(base[1]?.version);
	});

	test("a salt forces a re-run", () => {
		expect(build({ salt: "x" })[1]?.version).not.toBe(build({})[1]?.version);
	});

	test("refuses unknown assets, missing inputs and forward references", () => {
		const f = fixture();
		const tools = walkRootfs(f.rootfs);
		expect(() =>
			deriveStepVersions({
				steps: [
					{ name: "one", assets: ["nope"], after: [], inputs: [], salt: "" },
				],
				assets: f.assets,
				tools,
				stepsDir: f.steps,
			}),
		).toThrow(/unknown asset/);
		expect(() =>
			deriveStepVersions({
				steps: [
					{ name: "one", assets: [], after: [], inputs: ["/nope"], salt: "" },
				],
				assets: f.assets,
				tools,
				stepsDir: f.steps,
			}),
		).toThrow(/rootfs does not carry/);
		expect(() =>
			deriveStepVersions({
				steps: [
					{ name: "one", assets: [], after: ["two"], inputs: [], salt: "" },
				],
				assets: f.assets,
				tools,
				stepsDir: f.steps,
			}),
		).toThrow(/not an earlier step/);
	});

	test("renders tsv rows in execution order", () => {
		const tsv = renderStepsTsv(build({}));
		expect(
			tsv
				.split("\n")
				.filter(Boolean)
				.map((l) => l.split("\t")[0]),
		).toEqual(["one", "two"]);
		expect(renderAssetsTsv(fixture().assets)).toMatch(
			/^0644\ta{64}\t\.tar\.gz\t/,
		);
	});
});

describe("upstreamSteps", () => {
	const step = (name: string, after: string[] = []) => ({
		name,
		assets: [],
		after,
		inputs: [],
		salt: "",
	});

	test("closes `after` transitively, in manifest order, and leaves unrelated steps out", () => {
		const closure = upstreamSteps([
			step("a"),
			step("b", ["a"]),
			step("c"),
			step("d", ["c", "b"]),
		]);
		expect(Object.fromEntries(closure)).toEqual({
			a: [],
			b: ["a"],
			c: [],
			d: ["a", "b", "c"],
		});
	});

	test("refuses a forward reference", () => {
		expect(() => upstreamSteps([step("a", ["b"]), step("b")])).toThrow(
			/not an earlier step/,
		);
	});

	test("renders the closure as the fourth steps.tsv column", () => {
		const steps = [step("a"), step("b", ["a"])];
		const closure = upstreamSteps(steps);
		const rows = renderStepsTsv(
			steps.map((s, i) => ({
				...s,
				version: `v${i}`,
				upstream: closure.get(s.name) ?? [],
			})),
		)
			.split("\n")
			.filter(Boolean)
			.map((l) => l.split("\t"));
		expect(rows).toEqual([
			["a", "v0", "", ""],
			["b", "v1", "", "a"],
		]);
	});

	test("in the bundle, a Chrome failure skips only configure-chrome", () => {
		const closure = upstreamSteps(
			loadSteps(join(import.meta.dir, "..", "bundle", "steps.json")),
		);
		const downstream = [...closure]
			.filter(([, upstream]) => upstream.includes("install-chrome"))
			.map(([name]) => name);
		expect(downstream).toEqual(["configure-chrome"]);
	});
});

describe("renderAssetsTsv", () => {
	const step = (name: string, assets: string[], discards?: string[]) => ({
		name,
		assets,
		after: [],
		inputs: [],
		salt: "",
		discards,
	});
	const assets: Assets = {
		...fixture().assets,
		tool: {
			sha256: "c".repeat(64),
			suffix: "",
			dest: "/usr/local/share/superset/media/tool-1",
			mode: "0755",
		},
	};
	const columns = (tsv: string) =>
		tsv
			.split("\n")
			.filter(Boolean)
			.map((line) => line.split("\t"));

	test("names the step that discards a row in a fifth column, empty for a row that stays", () => {
		const rows = columns(
			renderAssetsTsv(assets, [step("install", ["thing", "tool"], ["thing"])]),
		);
		expect(rows.map((r) => [r[1]?.[0], r[4]])).toEqual([
			["a", "install"],
			["c", ""],
		]);
		expect(rows.map((r) => r.length)).toEqual([5, 5]);
		expect(Buffer.from(rows[1]?.[3] ?? "", "base64").toString()).toBe(
			"/usr/local/share/superset/media/tool-1",
		);
	});

	test("refuses a discard that is not the step's asset, or one two steps claim", () => {
		expect(() => discardingSteps([step("one", ["tool"], ["thing"])])).toThrow(
			/not one of its assets/,
		);
		expect(() =>
			discardingSteps([
				step("one", ["thing"], ["thing"]),
				step("two", ["thing"], ["thing"]),
			]),
		).toThrow(/both discard thing/);
	});

	test("the bundle keeps the binaries it runs in place and discards the archives", () => {
		const owners = discardingSteps(
			loadSteps(join(import.meta.dir, "..", "bundle", "steps.json")),
		);
		expect(owners.has("claude")).toBe(false);
		expect(owners.has("cli")).toBe(false);
		expect(owners.get("codex")).toBe("install-agent-clis");
		expect(owners.get("chrome")).toBe("install-chrome");
		expect(owners.get("host-service")).toBe("install-host");
	});
});
