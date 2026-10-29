import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { DEFAULT_MARKETPLACE } from "@superset/shared/plugins";

const execFileAsync = promisify(execFile);

export type PluginCliAction = "install" | "uninstall" | "enable" | "disable";

export interface PluginCliResult {
	/** Set when the change landed but no agent config could take its tools. */
	mcpError: string | null;
}

export async function runPluginCli(
	cli: string,
	action: PluginCliAction,
	name: string,
	timeoutMs = 60_000,
): Promise<PluginCliResult> {
	try {
		const { stdout } = await execFileAsync(
			cli,
			["plugins", "local", action, `${name}@${DEFAULT_MARKETPLACE}`, "--json"],
			{ timeout: timeoutMs },
		);
		return { mcpError: parseMcpError(stdout) };
	} catch (error) {
		throw new Error(cliErrorMessage(error, timeoutMs), { cause: error });
	}
}

/** The CLI's agent-setup logs share stdout, so the JSON is the last top-level object. */
function parseMcpError(stdout: string): string | null {
	try {
		const data = JSON.parse(stdout.slice(stdout.lastIndexOf("\n{") + 1)) as {
			mcpError?: unknown;
		};
		return typeof data.mcpError === "string" ? data.mcpError : null;
	} catch {
		return null;
	}
}

function cliErrorMessage(error: unknown, timeoutMs: number): string {
	if ((error as { killed?: unknown }).killed) {
		const seconds = Math.round(timeoutMs / 1000);
		return i18n._(
			msg({
				message: `The plugin change did not finish in ${seconds} seconds.`,
			}),
		);
	}
	const stderr = (error as { stderr?: unknown }).stderr;
	const line =
		typeof stderr === "string"
			? stderr.split("\n").find((entry) => entry.startsWith("Error: "))
			: undefined;
	if (line) return line.slice("Error: ".length);
	return error instanceof Error ? error.message : String(error);
}
