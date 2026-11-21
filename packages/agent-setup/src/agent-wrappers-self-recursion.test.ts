import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Nothing here runs a wrapper that can resolve to itself: a looping wrapper
// forks without bound and a timeout on the parent does not stop descendants.
// Resolution is tested by running only the generated `find_real_binary`
// function, which prints a path and cannot recurse. Whole-wrapper runs use a
// PATH holding nothing but an echoing stub.
const TEST_ROOT = mkdtempSync(path.join(tmpdir(), "superset-wrapper-self-"));
const FAKE_HOME = path.join(TEST_ROOT, "fake-home");
const REAL_BIN_DIR = path.join(TEST_ROOT, "real-bin");
const SYSTEM_PATH = "/usr/bin:/bin";

const wrappers: Record<string, unknown> = await import("./agent-wrappers");
const {
	getWrapperDepthVar,
	MAX_WRAPPER_NESTING,
	WRAPPER_LOOP_EXIT_STATUS,
	WRAPPER_MARKER,
} = await import("./agent-wrappers-common");

const WRAPPER_CREATORS = Object.entries(wrappers)
	.filter(([name]) => /^create\w+Wrapper$/.test(name))
	.map(([, value]) => value as () => void);

/** Generates every wrapper as if the app home were `homeDir`; returns its bin dir. */
function generateWrappers(homeDir: string): string {
	const binDir = path.join(homeDir, "bin");
	mkdirSync(binDir, { recursive: true });
	const saved = {
		SUPERSET_HOME_DIR: process.env.SUPERSET_HOME_DIR,
		HOME: process.env.HOME,
	};
	const log = console.log;
	process.env.SUPERSET_HOME_DIR = homeDir;
	process.env.HOME = FAKE_HOME;
	console.log = () => {};
	try {
		for (const create of WRAPPER_CREATORS) create();
	} finally {
		console.log = log;
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
	return binDir;
}

mkdirSync(FAKE_HOME, { recursive: true });
const BIN_DIR = generateWrappers(path.join(TEST_ROOT, "app-home"));
const BINARIES = readdirSync(BIN_DIR).sort();
const ALIAS_BIN_DIR = path.join(TEST_ROOT, "alias-bin");
symlinkSync(BIN_DIR, ALIAS_BIN_DIR);

function writeExecutable(file: string, content: string): void {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, content, { mode: 0o755 });
}

function installStub(dir: string, binary: string): string {
	const stubPath = path.join(dir, binary);
	writeExecutable(
		stubPath,
		`#!/bin/bash\necho "STUB depth=$${getWrapperDepthVar(binary)}"\n`,
	);
	return stubPath;
}

function scenarioDir(name: string): string {
	const dir = path.join(TEST_ROOT, name);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function extractResolver(wrapperScript: string): string {
	const match = wrapperScript.match(
		/^find_real_binary\(\) \{\n[\s\S]*?\n\}\n/m,
	);
	if (!match) throw new Error("find_real_binary not found in wrapper");
	return match[0];
}

/**
 * Runs the wrapper's own resolver with `$0` set to the wrapper path, the way
 * the kernel hands it over for a real launch.
 */
function resolve(
	binary: string,
	wrapperPath: string,
	options: { path: string; cwd?: string; argv0?: string },
): { status: number | null; stdout: string } {
	const result = spawnSync(
		"/bin/bash",
		[
			"-c",
			'eval "$RESOLVER"; find_real_binary "$1"',
			options.argv0 ?? wrapperPath,
			binary,
		],
		{
			cwd: options.cwd ?? TEST_ROOT,
			encoding: "utf8",
			timeout: 4000,
			env: {
				PATH: options.path,
				HOME: FAKE_HOME,
				RESOLVER: extractResolver(readFileSync(wrapperPath, "utf8")),
			},
		},
	);
	return { status: result.status, stdout: result.stdout.trim() };
}

function runWrapper(
	wrapperPath: string,
	stubDir: string,
	env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
	const result = spawnSync(wrapperPath, ["--version"], {
		cwd: TEST_ROOT,
		encoding: "utf8",
		timeout: 4000,
		env: {
			PATH: `${stubDir}:${SYSTEM_PATH}`,
			HOME: FAKE_HOME,
			...env,
		},
	});
	return {
		status: result.status,
		stdout: result.stdout.trim(),
		stderr: result.stderr,
	};
}

afterAll(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("every generated wrapper", () => {
	it("is generated", () => {
		expect(BINARIES.length).toBe(WRAPPER_CREATORS.length);
		expect(BINARIES).toContain("claude");
	});

	describe.each(BINARIES)("%s", (binary) => {
		it("has the marker on its second line", () => {
			const lines = readFileSync(path.join(BIN_DIR, binary), "utf8").split(
				"\n",
			);
			expect(lines[1]).toBe(WRAPPER_MARKER);
		});

		it("skips its own bin dir reached through an alias", () => {
			const stub = installStub(REAL_BIN_DIR, binary);

			const result = resolve(binary, path.join(BIN_DIR, binary), {
				path: `${ALIAS_BIN_DIR}:${REAL_BIN_DIR}:${SYSTEM_PATH}`,
				argv0: path.join(ALIAS_BIN_DIR, binary),
			});

			expect(result.stdout).toBe(stub);
		});
	});
});

describe("real binary resolution under a different HOME", () => {
	const binary = "claude";
	const wrapper = path.join(BIN_DIR, binary);
	const stub = installStub(REAL_BIN_DIR, binary);

	it("skips a symlink to the wrapper in another PATH dir", () => {
		const linkDir = scenarioDir("usr-local-bin");
		symlinkSync(wrapper, path.join(linkDir, binary));

		expect(
			resolve(binary, wrapper, {
				path: `${linkDir}:${REAL_BIN_DIR}:${SYSTEM_PATH}`,
				argv0: path.join(linkDir, binary),
			}).stdout,
		).toBe(stub);
		expect(
			resolve(binary, wrapper, {
				path: `${linkDir}:${SYSTEM_PATH}`,
				argv0: path.join(linkDir, binary),
			}),
		).toEqual({ status: 1, stdout: "" });
	});

	it("skips relative and duplicated entries that name the wrapper", () => {
		const root = scenarioDir("relative");
		symlinkSync(BIN_DIR, path.join(root, "rel-bin"));

		const result = resolve(binary, wrapper, {
			cwd: root,
			argv0: `rel-bin/${binary}`,
			path: [
				"rel-bin",
				"./rel-bin/",
				BIN_DIR,
				`${BIN_DIR}//`,
				`${BIN_DIR}/./`,
				REAL_BIN_DIR,
				SYSTEM_PATH,
			].join(":"),
		});

		expect(result.stdout).toBe(stub);
	});

	it("skips itself when its marker line is gone", () => {
		const dir = scenarioDir("unmarked");
		const unmarked = path.join(dir, binary);
		writeExecutable(
			unmarked,
			readFileSync(wrapper, "utf8").replace(`${WRAPPER_MARKER}\n`, ""),
		);

		const result = resolve(binary, unmarked, {
			path: `${dir}:${REAL_BIN_DIR}:${SYSTEM_PATH}`,
		});

		expect(result.stdout).toBe(stub);
	});

	it("skips a wrapper from another app home", () => {
		const otherBinDir = generateWrappers(path.join(TEST_ROOT, "home-b"));

		const result = resolve(binary, wrapper, {
			path: `${otherBinDir}:${REAL_BIN_DIR}:${SYSTEM_PATH}`,
		});

		expect(result.stdout).toBe(stub);
	});

	it("still returns a real binary that is not a Superset wrapper", () => {
		const otherDir = scenarioDir("other");
		writeExecutable(path.join(otherDir, binary), "#!/bin/bash\nexit 0\n");

		const result = resolve(binary, wrapper, {
			path: `${otherDir}:${REAL_BIN_DIR}:${SYSTEM_PATH}`,
		});

		expect(result.stdout).toBe(path.join(otherDir, binary));
	});
});

describe("loop guard", () => {
	const binary = "claude";
	const wrapper = path.join(BIN_DIR, binary);
	const depthVar = getWrapperDepthVar(binary);
	const stubDir = scenarioDir("stub-bin");
	installStub(stubDir, binary);

	it("counts each pass in the environment", () => {
		expect(runWrapper(wrapper, stubDir).stdout).toBe("STUB depth=1");
	});

	it("still runs one pass below the limit", () => {
		const result = runWrapper(wrapper, stubDir, {
			[depthVar]: String(MAX_WRAPPER_NESTING - 1),
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`STUB depth=${MAX_WRAPPER_NESTING}`);
	});

	it("refuses to run once the nesting limit is reached", () => {
		const result = runWrapper(wrapper, stubDir, {
			[depthVar]: String(MAX_WRAPPER_NESTING),
		});

		expect(result.status).toBe(WRAPPER_LOOP_EXIT_STATUS);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain(
			`${binary} wrapper started ${MAX_WRAPPER_NESTING} times`,
		);
		expect(result.stderr).toContain(`nested more than ${MAX_WRAPPER_NESTING}`);
		expect(result.stderr).toContain(`type -a ${binary}`);
	});

	it("reads leading zeros as decimal and ignores junk", () => {
		expect(runWrapper(wrapper, stubDir, { [depthVar]: "09" }).status).toBe(
			WRAPPER_LOOP_EXIT_STATUS,
		);
		expect(runWrapper(wrapper, stubDir, { [depthVar]: "x1" }).stdout).toBe(
			"STUB depth=1",
		);
	});

	it("does not share a counter between binaries", () => {
		const result = runWrapper(wrapper, stubDir, {
			[getWrapperDepthVar("codex")]: String(MAX_WRAPPER_NESTING),
		});

		expect(result.stdout).toBe("STUB depth=1");
	});
});
