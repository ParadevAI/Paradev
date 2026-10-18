import { describe, expect, it } from "bun:test";
import type { CommandConfig } from "./command";
import { CLIError } from "./errors";
import type { CliDescription } from "./help";
import { boolean, type GenericBuilderInternals, string } from "./option";
import { formatError, introspectCli, type RunOptions, run } from "./runner";

function trpcError(
	code: string,
	message: string,
	data: Record<string, unknown> = {},
): Error {
	const error = new Error(message) as Error & {
		data?: { code?: string } & Record<string, unknown>;
	};
	error.data = { code, ...data };
	return error;
}

describe("formatError", () => {
	it("keeps the server message for NOT_FOUND", () => {
		const result = formatError(
			trpcError(
				"NOT_FOUND",
				"Host abc123 is not registered in this organization",
			),
			"superset",
		);
		expect(result.message).toBe(
			"Host abc123 is not registered in this organization",
		);
	});

	it("falls back to generic text when NOT_FOUND has no message", () => {
		const result = formatError(trpcError("NOT_FOUND", ""), "superset");
		expect(result.message).toBe("Not found");
	});

	it("maps UNAUTHORIZED to a login hint", () => {
		const result = formatError(trpcError("UNAUTHORIZED", "nope"), "superset");
		expect(result.message).toBe("Session expired");
		expect(result.hint).toBe("Run: superset auth login");
	});

	it("adds an upgrade hint when the server names a required plan", () => {
		const result = formatError(
			trpcError("FORBIDDEN", "Automations require the Pro plan.", {
				requiredPlan: "pro",
			}),
			"superset",
		);
		expect(result.message).toBe("Automations require the Pro plan.");
		expect(result.hint).toContain("Needs the Pro plan");
		expect(result.hint).toContain("superset.sh/pricing");
	});

	it("names Enterprise when that is the tier", () => {
		const result = formatError(
			trpcError("FORBIDDEN", "SSO requires the Enterprise plan.", {
				requiredPlan: "enterprise",
			}),
			"superset",
		);
		expect(result.hint).toContain("Needs the Enterprise plan");
	});

	it("leaves other FORBIDDEN errors without a hint", () => {
		const result = formatError(
			trpcError("FORBIDDEN", "Not a member of this organization"),
			"superset",
		);
		expect(result.message).toBe("Not a member of this organization");
		expect(result.hint).toBeUndefined();
	});

	it("passes CLIError message and suggestion through", () => {
		const result = formatError(
			new CLIError("This machine isn't registered", "Run: superset start"),
			"superset",
		);
		expect(result.message).toBe("This machine isn't registered");
		expect(result.hint).toBe("Run: superset start");
	});
});

async function runArgs(args: string[], opts: RunOptions): Promise<void> {
	const argv = process.argv;
	process.argv = [argv[0] ?? "bun", argv[1] ?? "test", ...args];
	try {
		await run(opts);
	} finally {
		process.argv = argv;
	}
}

type AnyCommand = CommandConfig<
	Record<string, unknown>,
	Record<string, GenericBuilderInternals>
>;

function cmd(
	description: string,
	extra: Partial<AnyCommand> = {},
): CommandConfig {
	return { description, run: async () => undefined, ...extra } as CommandConfig;
}

describe("introspectCli", () => {
	it("describes the audience-filtered tree with the globals on the root", async () => {
		let described: CliDescription | undefined;
		await runArgs(["probe"], {
			name: "demo",
			version: "1.2.3",
			globals: { json: boolean().desc("As JSON") },
			tree: {
				groups: [
					{ path: ["tasks"], description: "Manage tasks", aliases: ["t"] },
					{ path: ["lab"], description: "Internal", audience: "internal" },
				],
				commands: [
					{
						path: ["probe"],
						command: cmd("Probe", {
							run: async () => {
								described = introspectCli();
								return undefined;
							},
						}),
					},
					{
						path: ["tasks", "list"],
						command: cmd("List tasks", {
							options: { limit: string().desc("Max rows") },
						}),
					},
					{
						path: ["lab", "x"],
						command: cmd("Hidden", { audience: "internal" }),
					},
				],
			},
		});

		expect(described?.name).toBe("demo");
		expect(described?.version).toBe("1.2.3");
		expect(described?.root.options?.json?.name).toBe("json");
		expect([...(described?.root.children.keys() ?? [])].sort()).toEqual([
			"probe",
			"tasks",
		]);
		const tasks = described?.root.children.get("tasks");
		expect(tasks?.aliases).toEqual(["t"]);
		const list = tasks?.children.get("list");
		expect(list?.description).toBe("List tasks");
		expect(list?.options?.limit?.name).toBe("limit");
	});

	it("is unavailable once run() has returned", async () => {
		await runArgs(["noop"], {
			name: "demo",
			version: "0.0.0",
			tree: {
				groups: [],
				commands: [{ path: ["noop"], command: cmd("Noop") }],
			},
		});
		expect(() => introspectCli()).toThrow(
			/only available while a command runs/,
		);
	});
});

describe("CLIError with data", () => {
	async function runFailing(json: boolean, { stdoutClosed = false } = {}) {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const capture =
			(sink: string[]) =>
			(chunk: string | Uint8Array, cb?: (error?: Error) => void) => {
				sink.push(String(chunk));
				cb?.();
				return true;
			};
		const brokenPipe = (
			_chunk: string | Uint8Array,
			cb?: (error?: Error) => void,
		) => {
			cb?.(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
			return false;
		};
		const write = { out: process.stdout.write, err: process.stderr.write };
		const exit = process.exit;
		let exitCode: number | undefined;
		process.stdout.write = (
			stdoutClosed ? brokenPipe : capture(stdout)
		) as never;
		process.stderr.write = capture(stderr) as never;
		process.exit = ((code?: number) => {
			exitCode = code;
		}) as never;
		try {
			await runArgs(["rm", json ? "--json" : "--quiet"], {
				name: "demo",
				version: "0.0.0",
				globals: {
					json: boolean().desc("As JSON"),
					quiet: boolean().desc("Quiet"),
				},
				tree: {
					groups: [],
					commands: [
						{
							path: ["rm"],
							command: cmd("Remove", {
								run: async () => {
									throw new CLIError("Not found: b", "Pass full ids", {
										deleted: ["a"],
										notFound: ["b"],
									});
								},
							}),
						},
					],
				},
			});
		} finally {
			process.stdout.write = write.out;
			process.stderr.write = write.err;
			process.exit = exit;
		}
		return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode };
	}

	it("prints the data under --json and still exits 1", async () => {
		const result = await runFailing(true);
		expect(JSON.parse(result.stdout)).toEqual({
			deleted: ["a"],
			notFound: ["b"],
		});
		expect(result.stderr).toBe("Error: Not found: b\nHint: Pass full ids\n");
		expect(result.exitCode).toBe(1);
	});

	it("still exits 1 when stdout is closed", async () => {
		const result = await runFailing(true, { stdoutClosed: true });
		expect(result.stderr).toBe("Error: Not found: b\nHint: Pass full ids\n");
		expect(result.exitCode).toBe(1);
	});

	it("prints only the error under --quiet", async () => {
		const result = await runFailing(false);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("Error: Not found: b\nHint: Pass full ids\n");
		expect(result.exitCode).toBe(1);
	});
});
