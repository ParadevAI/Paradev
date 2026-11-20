import { parseEnvContent } from "@superset/shared/env-file";

export { type EnvEntry, parseEnvContent } from "@superset/shared/env-file";

export function isValidEnvContent(text: string): boolean {
	return !text.includes("\0") && parseEnvContent(text).length > 0;
}
