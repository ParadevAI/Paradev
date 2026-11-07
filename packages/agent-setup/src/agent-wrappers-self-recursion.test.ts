import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
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

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const originalHome = process.env.HOME;

const {
	createClaudeWrapper,
	createCodexWrapper,
	createCopilotWrapper,
	createCursorAgentWrapper,
	createOpenCodeWrapper,
	createUfoWrapper,
} = await import("./agent-wrappers");
const { getWrapperDepthVar, MAX_WRAPPER_NESTING, WRAPPER_LOOP_EXIT_STATUS } =
	await import("./agent-wrappers-common");

const WRAPPER_CREATORS: Record<string, () => void> = {
	claude: createClaudeWrapper,
	codex: createCodexWrapper,
	opencode: createOpenCodeWrapper,
	copilot: createCopilotWrapper,
	ufo: createUfoWrapper,
	"cursor-agent": createCursorAgentWrapper,
};

function restoreEnv(): void {
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	if (originalHome === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = originalHome;
	}
}

/** Generates `binary`'s wrapper as if the app home were `homeDir`. */
function generateWrapper(binary: string, homeDir: string): string {
	mkdirSync(path.join(homeDir, "bin"), { recursive: true });
	process.env.SUPERSET_HOME_DIR = homeDir;
	process.env.HOME = FAKE_HOME;
	try {
		WRAPPER_CREATORS[binary]?.();
	} finally {
		restoreEnv();
	}
	return path.join(homeDir, "bin", binary);
}

function scenarioDir(binary: string, name: string): string {
	const dir = path.join(TEST_ROOT, `${binary}-${name}`);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	return dir;
}

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

beforeAll(() => {
	mkdirSync(FAKE_HOME, { recursive: true });
});

afterAll(() => {
	restoreEnv();
	rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe.each(Object.keys(WRAPPER_CREATORS))("%s wrapper", (binary) => {
	describe("real binary resolution under a different HOME", () => {
		it("skips an aliased bin dir", () => {
			const root = scenarioDir(binary, "alias");
			const wrapper = generateWrapper(binary, path.join(root, "app-home"));
			const alias = path.join(root, "alias-bin");
			symlinkSync(path.dirname(wrapper), alias);
			const stub = installStub(REAL_BIN_DIR, binary);

			const result = resolve(binary, wrapper, {
				path: `${alias}:${REAL_BIN_DIR}:${SYSTEM_PATH}`,
				argv0: path.join(alias, binary),
			});

			expect(result.stdout).toBe(stub);
		});

		it("skips a symlink to the wrapper in another PATH dir", () => {
			const root = scenarioDir(binary, "symlink");
			const wrapper = generateWrapper(binary, path.join(root, "app-home"));
			const linkDir = path.join(root, "usr-local-bin");
			mkdirSync(linkDir, { recursive: true });
			symlinkSync(wrapper, path.join(linkDir, binary));
			const stub = installStub(REAL_BIN_DIR, binary);

			const result = resolve(binary, wrapper, {
				path: `${linkDir}:${REAL_BIN_DIR}:${SYSTEM_PATH}`,
				argv0: path.join(linkDir, binary),
			});

			expect(result.stdout).toBe(stub);
		});

		it("finds nothing when only a symlink to the wrapper is on PATH", () => {
			const root = scenarioDir(binary, "symlink-only");
			const wrapper = generateWrapper(binary, path.join(root, "app-home"));
			const linkDir = path.join(root, "usr-local-bin");
			mkdirSync(linkDir, { recursive: true });
			symlinkSync(wrapper, path.join(linkDir, binary));

			const result = resolve(binary, wrapper, {
				path: `${linkDir}:${SYSTEM_PATH}`,
				argv0: path.join(linkDir, binary),
			});

			expect(result).toEqual({ status: 1, stdout: "" });
		});

		it("skips relative and duplicated entries that name the wrapper", () => {
			const root = scenarioDir(binary, "relative");
			const wrapper = generateWrapper(binary, path.join(root, "app-home"));
			const binDir = path.dirname(wrapper);
			symlinkSync(binDir, path.join(root, "rel-bin"));
			const stub = installStub(REAL_BIN_DIR, binary);

			const result = resolve(binary, wrapper, {
				cwd: root,
				argv0: `rel-bin/${binary}`,
				path: [
					"rel-bin",
					"./rel-bin/",
					binDir,
					`${binDir}//`,
					`${binDir}/./`,
					REAL_BIN_DIR,
					SYSTEM_PATH,
				].join(":"),
			});

			expect(result.stdout).toBe(stub);
		});

		it("skips a copy of the wrapper from another app home", () => {
			const root = scenarioDir(binary, "two-homes");
			const first = generateWrapper(binary, path.join(root, "home-a"));
			const second = generateWrapper(binary, path.join(root, "home-b"));
			const stub = installStub(REAL_BIN_DIR, binary);

			const fromFirst = resolve(binary, first, {
				path: `${path.dirname(second)}:${path.dirname(first)}:${REAL_BIN_DIR}:${SYSTEM_PATH}`,
			});
			const fromSecond = resolve(binary, second, {
				path: `${path.dirname(first)}:${path.dirname(second)}:${REAL_BIN_DIR}:${SYSTEM_PATH}`,
			});

			expect(fromFirst.stdout).toBe(stub);
			expect(fromSecond.stdout).toBe(stub);
		});

		it("still returns a real binary that is not a Superset wrapper", () => {
			const root = scenarioDir(binary, "plain");
			const wrapper = generateWrapper(binary, path.join(root, "app-home"));
			const otherDir = path.join(root, "other");
			writeExecutable(path.join(otherDir, binary), "#!/bin/bash\nexit 0\n");
			const stub = installStub(REAL_BIN_DIR, binary);

			const result = resolve(binary, wrapper, {
				path: `${otherDir}:${REAL_BIN_DIR}:${SYSTEM_PATH}`,
			});

			expect(result.stdout).toBe(path.join(otherDir, binary));
			expect(stub).not.toBe(result.stdout);
		});
	});

	describe("loop guard", () => {
		const depthVar = getWrapperDepthVar(binary);

		function setup(name: string): { wrapper: string; stubDir: string } {
			const root = scenarioDir(binary, name);
			const wrapper = generateWrapper(binary, path.join(root, "app-home"));
			const stubDir = path.join(root, "stub-bin");
			installStub(stubDir, binary);
			return { wrapper, stubDir };
		}

		it("counts each pass in the environment", () => {
			const { wrapper, stubDir } = setup("count");

			expect(runWrapper(wrapper, stubDir).stdout).toBe("STUB depth=1");
			expect(runWrapper(wrapper, stubDir, { [depthVar]: "3" }).stdout).toBe(
				"STUB depth=4",
			);
		});

		it("refuses to run once the nesting limit is reached", () => {
			const { wrapper, stubDir } = setup("limit");

			const result = runWrapper(wrapper, stubDir, {
				[depthVar]: String(MAX_WRAPPER_NESTING),
			});

			expect(result.status).toBe(WRAPPER_LOOP_EXIT_STATUS);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(`${binary} wrapper re-entered itself`);
			expect(result.stderr).toContain("Remove it from PATH");
		});

		it("still runs one pass below the limit", () => {
			const { wrapper, stubDir } = setup("below-limit");

			const result = runWrapper(wrapper, stubDir, {
				[depthVar]: String(MAX_WRAPPER_NESTING - 1),
			});

			expect(result.status).toBe(0);
			expect(result.stdout).toBe(`STUB depth=${MAX_WRAPPER_NESTING}`);
		});

		it("reads leading zeros as decimal and ignores junk", () => {
			const { wrapper, stubDir } = setup("junk");

			expect(runWrapper(wrapper, stubDir, { [depthVar]: "09" }).status).toBe(
				WRAPPER_LOOP_EXIT_STATUS,
			);
			expect(runWrapper(wrapper, stubDir, { [depthVar]: "x1" }).stdout).toBe(
				"STUB depth=1",
			);
		});

		it("does not share a counter between binaries", () => {
			const { wrapper, stubDir } = setup("separate");

			const result = runWrapper(wrapper, stubDir, {
				SUPERSET_WRAPPER_DEPTH_other: String(MAX_WRAPPER_NESTING),
			});

			expect(result.stdout).toBe("STUB depth=1");
		});
	});
});
