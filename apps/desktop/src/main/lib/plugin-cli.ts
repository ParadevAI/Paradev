import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PluginCliAction = "install" | "uninstall" | "enable" | "disable";

export async function runPluginCli(
	cli: string,
	action: PluginCliAction,
	name: string,
	timeoutMs = 60_000,
): Promise<void> {
	try {
		await execFileAsync(cli, ["plugins", "local", action, name, "--json"], {
			timeout: timeoutMs,
		});
	} catch (error) {
		throw new Error(cliErrorMessage(error), { cause: error });
	}
}

function cliErrorMessage(error: unknown): string {
	const stderr = (error as { stderr?: unknown }).stderr;
	const line =
		typeof stderr === "string"
			? stderr.split("\n").find((entry) => entry.startsWith("Error: "))
			: undefined;
	if (line) return line.slice("Error: ".length);
	return error instanceof Error ? error.message : String(error);
}
