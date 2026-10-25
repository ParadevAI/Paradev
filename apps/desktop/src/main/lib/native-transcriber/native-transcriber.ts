import { execFile as nodeExecFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BINARY_NAME = "superset-transcriber";
// The first run on a Mac may download the language model.
const TRANSCRIBE_TIMEOUT_MS = 120_000;

export type NativeTranscription =
	| { ok: true; text: string }
	| { ok: false; error: string; message: string };

type ExecFile = (
	file: string,
	args: string[],
	options: { timeout: number; signal?: AbortSignal },
) => Promise<{ stdout: string }>;

const execFile: ExecFile = (file, args, options) =>
	new Promise((resolve, reject) => {
		nodeExecFile(file, args, options, (error, stdout) => {
			// A failure still prints its JSON line; only a crash or timeout prints none.
			if (error && !stdout) reject(error);
			else resolve({ stdout });
		});
	});

export function findTranscriberBinary({
	platform = process.platform,
	isPackaged,
	resourcesPath,
	appPath,
	exists = existsSync,
}: {
	platform?: NodeJS.Platform;
	isPackaged: boolean;
	resourcesPath: string;
	appPath: string;
	exists?: (candidate: string) => boolean;
}): string | null {
	if (platform !== "darwin") return null;
	const candidates = isPackaged
		? [path.join(resourcesPath, "resources/bin", BINARY_NAME)]
		: [path.join(appPath, "dist/resources/bin", BINARY_NAME)];
	return candidates.find((candidate) => exists(candidate)) ?? null;
}

export function parseTranscriberOutput(stdout: string): NativeTranscription {
	const line = stdout.trim().split("\n").at(-1) ?? "";
	let parsed: { text?: unknown; error?: unknown; message?: unknown };
	try {
		parsed = JSON.parse(line);
	} catch {
		return {
			ok: false,
			error: "failed",
			message: "Unreadable transcriber output",
		};
	}
	if (typeof parsed.text === "string") return { ok: true, text: parsed.text };
	return {
		ok: false,
		error: typeof parsed.error === "string" ? parsed.error : "failed",
		message: typeof parsed.message === "string" ? parsed.message : "",
	};
}

export async function transcribeNatively({
	binary,
	wav,
	run = execFile,
	timeoutMs = TRANSCRIBE_TIMEOUT_MS,
	signal,
}: {
	binary: string;
	wav: Uint8Array;
	run?: ExecFile;
	timeoutMs?: number;
	signal?: AbortSignal;
}): Promise<NativeTranscription> {
	const dir = await mkdtemp(path.join(tmpdir(), "superset-dictation-"));
	const file = path.join(dir, "clip.wav");
	try {
		await writeFile(file, wav, { mode: 0o600 });
		const { stdout } = await run(binary, [file], {
			timeout: timeoutMs,
			signal,
		});
		return parseTranscriberOutput(stdout);
	} catch (error) {
		return {
			ok: false,
			error: "failed",
			message: error instanceof Error ? error.message : String(error),
		};
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
