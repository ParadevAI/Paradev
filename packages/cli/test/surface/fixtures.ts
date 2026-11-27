import { expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	CLIError,
	type CommandResult,
	formatOutput,
} from "@superset/cli-framework";
import { writeFormattedJson } from "../../scripts/cli-surface";
import type { ApiClient } from "../../src/lib/api-client";
import type { CliContext } from "../../src/lib/command";

const FIXTURES_DIR = resolve(import.meta.dir, "fixtures");
const RECORD = process.env.RECORD_FIXTURES === "1";

type Procedure = (input: unknown) => unknown;

export interface FakeApi {
	api: ApiClient;
	calls: Array<{ path: string; input: unknown }>;
}

/** An `api` client whose `a.b.query(input)` / `.mutate(input)` returns `procedures["a.b"](input)`. */
export function fakeApi(procedures: Record<string, Procedure>): FakeApi {
	const calls: FakeApi["calls"] = [];
	const at = (segments: string[]): unknown =>
		new Proxy(() => {}, {
			get: (_target, key) => {
				if (key !== "query" && key !== "mutate") {
					return at([...segments, String(key)]);
				}
				const path = segments.join(".");
				return async (input: unknown) => {
					const procedure = procedures[path];
					if (!procedure) throw new Error(`fakeApi: no procedure for ${path}`);
					calls.push({ path, input });
					return procedure(input);
				};
			},
		});
	return { api: at([]) as ApiClient, calls };
}

export function fakeContext(overrides: Partial<CliContext> = {}): CliContext {
	return {
		api: fakeApi({}).api,
		config: { organizationId: "org_fixture" },
		bearer: "sk_live_fixture",
		authSource: "override",
		...overrides,
	};
}

export type FixtureResult =
	| { data: unknown; message?: string }
	| { error: { message: string; hint?: string } };

interface Runnable<TInput> {
	run: (opts: TInput) => Promise<CommandResult>;
	display?: (data: unknown) => string;
}

/** Runs a command's `run` and keeps what `--json` prints, or the error a failing run reports. */
export async function runForFixture<TInput>(
	command: Runnable<TInput>,
	input: NoInfer<Omit<TInput, "signal">>,
): Promise<FixtureResult> {
	try {
		const result = await command.run({
			...input,
			signal: new AbortController().signal,
		} as TInput);
		const json = formatOutput(result, command.display, {
			json: true,
			quiet: false,
		});
		const message =
			result && typeof result === "object" && "message" in result
				? result.message
				: undefined;
		return {
			data: json === undefined ? null : JSON.parse(json),
			...(message !== undefined && { message }),
		};
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		const hint = error instanceof CLIError ? error.suggestion : undefined;
		return { error: { message: error.message, ...(hint && { hint }) } };
	}
}

/**
 * Compares a result with case `name` in `fixtures/<file>.json`. Record a new or
 * changed case with `RECORD_FIXTURES=1 bun test packages/cli/test/surface`.
 */
export function expectFixture(
	file: string,
	name: string,
	actual: FixtureResult,
): void {
	const path = resolve(FIXTURES_DIR, `${file}.json`);
	const cases: Record<string, FixtureResult> = existsSync(path)
		? JSON.parse(readFileSync(path, "utf8"))
		: {};
	if (RECORD) {
		cases[name] = actual;
		const sorted = Object.fromEntries(
			Object.entries(cases).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
		);
		writeFormattedJson(path, sorted);
		return;
	}
	if (!(name in cases)) {
		throw new Error(
			`No fixture "${name}" in ${path}. Record it with: RECORD_FIXTURES=1 bun test packages/cli/test/surface`,
		);
	}
	expect(actual).toEqual(cases[name] as FixtureResult);
}
