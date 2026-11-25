import fs from "node:fs";
import path from "node:path";
import { resolveAppHomeDir } from "./paths";

export const TELEMETRY_STATE_FILE = "telemetry.json";

export function getTelemetryStateFilePath(): string {
	return path.join(resolveAppHomeDir(), TELEMETRY_STATE_FILE);
}

export function isDoNotTrackSet(env: NodeJS.ProcessEnv = process.env): boolean {
	const value = env.DO_NOT_TRACK?.trim().toLowerCase();
	return Boolean(value) && value !== "0" && value !== "false";
}

export function readTelemetrySetting(
	filePath = getTelemetryStateFilePath(),
): boolean {
	try {
		const raw: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		return (raw as { enabled?: unknown })?.enabled !== false;
	} catch {
		return true;
	}
}

export function writeTelemetrySetting(
	enabled: boolean,
	filePath = getTelemetryStateFilePath(),
): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify({ enabled }, null, "\t")}\n`, {
		mode: 0o644,
	});
}

export function isTelemetryEnabled({
	env = process.env,
	filePath,
}: {
	env?: NodeJS.ProcessEnv;
	filePath?: string;
} = {}): boolean {
	return !isDoNotTrackSet(env) && readTelemetrySetting(filePath);
}
