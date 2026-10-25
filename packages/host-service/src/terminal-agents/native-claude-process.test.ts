import { describe, expect, test } from "bun:test";
import {
	findNativeClaudeAttachClient,
	findNativeClaudeTerminalClient,
	type NativeClaudeProcessIO,
	type NativeClaudeProcessOptions,
	observeNativeClaudeProcess,
	resolveTrustedNativeClaudeExecutable,
} from "./native-claude-process";

const home = "/home/test";
const executable = `${home}/.local/share/claude/versions/2.1.302`;
const alias = `${home}/.local/bin/claude`;
const profile = `${home}/.claude-work`;
const cwd = `${home}/project`;
const birth = "Sun Oct 18 01:02:03 2026";
const command = `${alias} attach cf9dc1cc`;
const metadata = (pid = 101, parent = 100, extra = "") =>
	`${pid} ${parent} 501 S ${birth} ${alias}\n${extra}`;
const root = `100 1 501 S Sun Oct 18 01:01:00 2026 /bin/zsh\n`;
const environment = `${command} HOME=${home} PATH=/bin:/an app/bin CLAUDE_CONFIG_DIR=${profile}`;
const lsof = `p101\0u501\0\nfcwd\0D1\0i2\0n${cwd}\0\nftxt\0D1\0i3\0n${executable}\0\n`;

function fixture() {
	const calls: { file: string; args: string[] }[] = [];
	const files = new Map<string, string>();
	const links = new Map<string, string>([[alias, executable]]);
	const overrides = new Map<string, string>();
	let headerReads = 0;
	let tableReads = 0;
	let imageReads = 0;
	const io: NativeClaudeProcessIO = {
		async mainImagePath() {
			imageReads++;
			return (
				(overrides.get(`image${imageReads}`) ??
					overrides.get("image") ??
					executable) ||
				null
			);
		},
		async executableFile(path) {
			const file = await io.stat(path);
			if (!file.isFile()) throw new Error("Not a synthetic executable file");
			return {
				uid: file.uid,
				mode: file.mode,
				ino: file.ino,
				dev: file.dev,
				size: 100,
				links: 2,
				mtimeNs: "1",
				ctimeNs: "2",
			};
		},
		async run(file, args, options) {
			calls.push({ file, args });
			expect(options.timeout).toBe(1500);
			expect(options.maxBuffer).toBe(512 * 1024);
			expect(options.signal.aborted).toBe(false);
			if (file === "/usr/sbin/lsof") return overrides.get("lsof") ?? lsof;
			expect(file).toBe("/bin/ps");
			if (args.includes("-U")) {
				tableReads++;
				return (
					overrides.get(`table${tableReads}`) ??
					overrides.get("table") ??
					root + metadata()
				);
			}
			if (args.at(-1) === "pid=,ppid=,uid=,state=,lstart=,comm=") {
				headerReads++;
				return (
					overrides.get(`header${headerReads}`) ??
					overrides.get("header") ??
					metadata()
				);
			}
			return args.includes("-E")
				? (overrides.get("environment") ?? environment)
				: (overrides.get("command") ?? command);
		},
		async read(path, signal) {
			expect(signal.aborted).toBe(false);
			const value = files.get(path);
			if (value === undefined) throw new Error("Missing synthetic file");
			return Buffer.from(value);
		},
		async realpath(path) {
			return links.get(path) ?? path;
		},
		async readlink(path) {
			const value = links.get(path);
			if (value === undefined) throw new Error("Missing synthetic link");
			return value;
		},
		async stat(path) {
			return {
				uid: 501,
				mode: path === executable ? 0o100755 : 0o40700,
				dev: 1,
				ino: path === executable ? 3 : 2,
				isFile: () => path === executable,
				isDirectory: () => path !== executable,
			};
		},
	};
	const options: NativeClaudeProcessOptions = {
		platform: "darwin",
		home,
		uid: 501,
		io,
	};
	return { io, options, calls, files, links, overrides };
}

describe("native Claude process observation", () => {
	test("uses the retained301 main image after the launcher rotates to303", async () => {
		const f = fixture();
		const retained = `${home}/.local/share/claude/versions/2.1.301`;
		const newer = `${home}/.local/share/claude/versions/2.1.303`;
		const retainedFile = await f.io.stat(executable);
		const originalStat = f.io.stat;
		f.io.stat = async (path) =>
			path === retained
				? retainedFile
				: path === newer
					? { ...retainedFile, ino: 4 }
					: originalStat(path);
		f.links.set(alias, newer);
		f.overrides.set("image", retained);
		f.overrides.set("lsof", lsof.replace(executable, retained));
		expect((await observeNativeClaudeProcess(101, f.options)).executable).toBe(
			retained,
		);
		expect(
			(await findNativeClaudeTerminalClient(100, f.options))?.executable,
		).toBe(retained);
	});

	test("accepts only an exact version hardlink to the retained trusted main-image vnode", async () => {
		for (const version of ["2.1.301", "2.1.302"]) {
			const retained = `${home}/.local/share/claude/versions/${version}`;
			const hardlink = `/private/task/native-hold/${version}`;
			for (const mappedName of [retained, hardlink]) {
				const f = fixture();
				const file = await f.io.stat(executable);
				const originalStat = f.io.stat;
				f.io.stat = async (path) =>
					[retained, hardlink].includes(path) ? file : originalStat(path);
				f.links.set(alias, `${home}/.local/share/claude/versions/2.1.303`);
				f.overrides.set("image", hardlink);
				f.overrides.set("lsof", lsof.replace(executable, mappedName));
				expect(
					(await observeNativeClaudeProcess(101, f.options)).executable,
				).toBe(retained);
				let images = 0;
				f.io.mainImagePath = async () => (++images === 1 ? hardlink : retained);
				expect(
					(await observeNativeClaudeProcess(101, f.options)).executable,
				).toBe(retained);
			}
		}
	});

	test("refuses mismatched retained inode, unknown alias names, or changing hardlink metadata", async () => {
		for (const failure of [
			"inode",
			"restored300",
			"name",
			"metadata",
			"symlink",
		]) {
			const f = fixture();
			const version = failure === "restored300" ? "2.1.300" : "2.1.302";
			const retained = `${home}/.local/share/claude/versions/${version}`;
			const hardlink = `/private/task/native-hold/${failure === "name" ? "claude" : version}`;
			const file = await f.io.stat(executable);
			const originalStat = f.io.stat;
			f.io.stat = async (path) =>
				path === hardlink
					? { ...file, ino: failure === "inode" ? 4 : file.ino }
					: path === retained
						? { ...file, ino: failure === "restored300" ? 4 : file.ino }
						: originalStat(path);
			f.overrides.set("image", hardlink);
			if (failure === "symlink") f.links.set(hardlink, executable);
			const snapshot = f.io.executableFile;
			let reads = 0;
			f.io.executableFile = async (path) => {
				const value = await snapshot(path);
				if (path === hardlink && failure === "metadata" && ++reads > 1)
					return { ...value, ctimeNs: "changed" };
				return value;
			};
			await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
				"could not be verified",
			);
		}
	});

	test("refuses ambiguous or replaced mapped images even with kernel authority", async () => {
		for (const mapped of [
			`${lsof}ftxt\0D1\0i3\0n${executable}\0\n`,
			lsof.replace("i3\0", "i4\0"),
		]) {
			const f = fixture();
			f.overrides.set("lsof", mapped);
			await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
				"could not be verified",
			);
		}
	});

	test("never falls back to a launcher or mapped library when main-image authority fails", async () => {
		for (const image of ["", "/tmp/foreign-main-image"]) {
			const f = fixture();
			f.overrides.set("image", image);
			await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
				"could not be verified",
			);
		}
		const f = fixture();
		f.overrides.set("image2", `${home}/.local/share/claude/versions/2.1.303`);
		await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
			"could not be verified",
		);
	});
	test("corroborates macOS executable, incarnation, profile, cwd and exact attach argv", async () => {
		const f = fixture();
		expect(await observeNativeClaudeProcess(101, f.options)).toEqual({
			pid: 101,
			parentPid: 100,
			uid: 501,
			birth,
			executable,
			configDir: profile,
			cwd,
			args: ["attach", "cf9dc1cc"],
		});
		expect(
			f.calls.every((call) =>
				["/bin/ps", "/usr/sbin/lsof"].includes(call.file),
			),
		).toBe(true);
		expect(await resolveTrustedNativeClaudeExecutable(alias, f.options)).toBe(
			executable,
		);
	});

	test("rejects command extras and does not expose prompts or secret values", async () => {
		const f = fixture();
		f.overrides.set("command", `${command} --print private-prompt`);
		await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
			"could not be verified",
		);
		expect(f.calls.some((call) => call.file === "/usr/sbin/lsof")).toBe(false);
		f.overrides.delete("command");
		f.overrides.set(
			"environment",
			`${environment} CLAUDE_CODE_OAUTH_TOKEN=private-token`,
		);
		try {
			await observeNativeClaudeProcess(101, f.options);
			throw new Error("Expected refusal");
		} catch (error) {
			expect(String(error)).not.toContain("private-token");
			expect(String(error)).toContain("could not be verified");
		}
	});

	test("rejects ambiguous, duplicate, unavailable and redirected account environments", async () => {
		const f = fixture();
		for (const value of [
			`${command} HOME=${home} PATH=/bin CLAUDE_CONFIG_DIR=${profile} other`,
			`${environment} CLAUDE_CONFIG_DIR=${profile}`,
			`${environment} `,
			command,
			`${environment} ANTHROPIC_BASE_URL=https://other.example`,
			`${environment} CLAUDE_CODE_USE_BEDROCK=1`,
		]) {
			f.overrides.set("environment", value);
			await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
				"could not be verified",
			);
		}
	});

	test("rejects mapped executable replacement and PID reuse", async () => {
		const f = fixture();
		f.overrides.set("lsof", lsof.replace("i3\0", "i4\0"));
		await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
			"could not be verified",
		);
		f.overrides.delete("lsof");
		f.overrides.set("header3", metadata().replace("01:02:03", "01:02:04"));
		await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
			"could not be verified",
		);
	});

	test("refuses duplicate or malformed mapped-file fields", async () => {
		for (const value of [
			lsof.replace("D1\0", "D1invalid\0"),
			lsof.replace(`n${executable}\0`, `n/tmp/other\0n${executable}\0`),
		]) {
			const f = fixture();
			f.overrides.set("lsof", value);
			await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
				"could not be verified",
			);
		}
	});

	test("refuses foreign, stopped and unsupported executables", async () => {
		for (const header of [
			metadata().replace("501", "502"),
			metadata().replace("501 S", "501 T"),
			metadata().replace(alias, "/tmp/claude"),
		]) {
			const f = fixture();
			f.overrides.set("header", header);
			await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
				"could not be verified",
			);
		}
	});

	test("finds one current client under the exact root without blocking on unrelated stopped processes", async () => {
		const f = fixture();
		f.overrides.set(
			"table",
			`${root}${metadata()}102 1 501 T Sun Oct 18 01:00:00 2026 /bin/zsh\n`,
		);
		const found = await findNativeClaudeAttachClient(100, f.options);
		expect(found?.backgroundId).toBe("cf9dc1cc");
		expect(found?.ancestors).toEqual([
			{ pid: 100, parentPid: 1, uid: 501, birth: "Sun Oct 18 01:01:00 2026" },
		]);
		const g = fixture();
		g.overrides.set(
			"table2",
			root.replace("01:01:00", "01:01:01") + metadata(),
		);
		await expect(findNativeClaudeAttachClient(100, g.options)).rejects.toThrow(
			"could not be verified",
		);
	});

	test("returns absence only when the root has no native Claude descendant", async () => {
		const f = fixture();
		f.overrides.set(
			"table",
			root + metadata().replace(alias, "/usr/bin/sleep"),
		);
		expect(await findNativeClaudeAttachClient(100, f.options)).toBeNull();
		expect(f.calls).toHaveLength(1);
		expect(f.calls[0]?.args).toContain("-U");
		expect(await findNativeClaudeTerminalClient(100, f.options)).toBeNull();
	});

	for (const currentCommand of [
		alias,
		executable,
		"claude",
		`${alias} --resume cf9dc1cc-3d55-4149-8a3b-c16be579690b`,
		`${alias} agents`,
	]) {
		test(`refuses a live unresolved native client instead of reporting absence: ${currentCommand}`, async () => {
			const f = fixture();
			f.overrides.set("command", currentCommand);
			f.overrides.set(
				"environment",
				`${currentCommand} HOME=${home} PATH=/bin CLAUDE_CONFIG_DIR=${profile}`,
			);
			const observed = await observeNativeClaudeProcess(101, f.options);
			expect(observed).toMatchObject({
				pid: 101,
				birth,
				executable,
				cwd,
				configDir: profile,
				args: [],
			});
			const native = await findNativeClaudeTerminalClient(100, f.options);
			expect(native).toEqual({
				...observed,
				ancestors: [
					{
						pid: 100,
						parentPid: 1,
						uid: 501,
						birth: "Sun Oct 18 01:01:00 2026",
					},
				],
			});
			expect(native).not.toHaveProperty("backgroundId");
			expect(native).not.toHaveProperty("currentSessionId");
			await expect(
				findNativeClaudeAttachClient(100, f.options),
			).rejects.toThrow("could not be verified");
		});
	}

	test("does not choose a known attachment beside another unresolved native client", async () => {
		const f = fixture();
		f.overrides.set("table", root + metadata() + metadata(102));
		const original = f.io.run;
		f.io.run = async (file, args, options) => {
			const value = await original(file, args, options);
			if (!args.includes("102")) return value;
			if (file === "/bin/ps" && args.at(-1) === "command=")
				return args.includes("-E")
					? `${alias} HOME=${home} PATH=/bin CLAUDE_CONFIG_DIR=${profile}`
					: alias;
			return value.replaceAll("101", "102");
		};
		await expect(findNativeClaudeAttachClient(100, f.options)).rejects.toThrow(
			"could not be verified",
		);
		await expect(
			findNativeClaudeTerminalClient(100, f.options),
		).rejects.toThrow("could not be verified");
	});
	test("observes a name-based native attachment without claiming its selected session", async () => {
		const f = fixture();
		const namedCommand = `${alias} attach Medusa account test`;
		f.overrides.set("command", namedCommand);
		f.overrides.set(
			"environment",
			`${namedCommand} HOME=${home} PATH=/bin CLAUDE_CONFIG_DIR=${profile}`,
		);
		const observed = await findNativeClaudeTerminalClient(100, f.options);
		expect(observed).toMatchObject({
			pid: 101,
			birth,
			executable,
			cwd,
			configDir: profile,
			args: [],
		});
		expect(observed).not.toHaveProperty("backgroundId");
		await expect(findNativeClaudeAttachClient(100, f.options)).rejects.toThrow(
			"could not be verified",
		);
		await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
			"could not be verified",
		);
	});

	test("refuses ambiguous multiple attachments and a changed parent chain", async () => {
		const f = fixture();
		const original = f.io.run;
		f.io.run = async (file, args, options) => {
			const value = await original(file, args, options);
			return args.includes("102") ||
				(file === "/usr/sbin/lsof" && args.includes("102"))
				? value.replaceAll("101", "102")
				: value;
		};
		f.overrides.set("table", root + metadata() + metadata(102));
		await expect(findNativeClaudeAttachClient(100, f.options)).rejects.toThrow(
			"could not be verified",
		);
		const g = fixture();
		g.overrides.set("table2", root + metadata(101, 1));
		await expect(findNativeClaudeAttachClient(100, g.options)).rejects.toThrow(
			"could not be verified",
		);
	});

	test("rejects oversized command output and aborts pending inspection without waiting", async () => {
		const f = fixture();
		f.overrides.set("command", "x".repeat(512 * 1024 + 1));
		await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
			"could not be verified",
		);
		const controller = new AbortController();
		f.options.signal = controller.signal;
		f.io.run = async (_file, _args, options) => {
			expect(options.signal.aborted).toBe(false);
			queueMicrotask(() => controller.abort());
			return new Promise(() => {});
		};
		await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
			"could not be verified",
		);
	});

	test("reads Linux NUL-delimited argv and environment with exact start ticks", async () => {
		const f = fixture();
		f.options.platform = "linux";
		f.links.set("/proc/101/exe", executable);
		f.links.set("/proc/101/cwd", cwd);
		const fields = ["S", "100", ...Array<string>(17).fill("0"), "12345", "0"];
		f.files.set("/proc/101/stat", `101 (claude) ${fields.join(" ")}\n`);
		f.files.set(
			"/proc/101/status",
			"Name:\tclaude\nUid:\t501\t501\t501\t501\n",
		);
		f.files.set("/proc/101/cmdline", `${alias}\0attach\0cf9dc1cc\0`);
		f.files.set(
			"/proc/101/environ",
			`HOME=${home}\0PATH=/bin\0CLAUDE_CONFIG_DIR=${profile}\0`,
		);
		expect(await observeNativeClaudeProcess(101, f.options)).toEqual({
			pid: 101,
			parentPid: 100,
			uid: 501,
			birth: "proc-start:12345",
			executable,
			cwd,
			configDir: profile,
			args: ["attach", "cf9dc1cc"],
		});
		expect(f.calls).toEqual([]);
		f.files.set("/proc/101/cmdline", `${alias}\0attach\0cf9dc1cc\0--print\0`);
		await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
			"could not be verified",
		);
	});

	test("refuses unsupported platforms and pre-aborted requests before process reads", async () => {
		const f = fixture();
		f.options.platform = "win32";
		await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
			"could not be verified",
		);
		f.options.platform = "darwin";
		f.options.signal = AbortSignal.abort();
		await expect(observeNativeClaudeProcess(101, f.options)).rejects.toThrow(
			"could not be verified",
		);
		expect(f.calls).toEqual([]);
	});
});
