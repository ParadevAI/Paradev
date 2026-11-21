import { join } from "node:path";
import { resolveAppHomeDir } from "@superset/agent-setup/paths";

export function getLocalDbPath(): string {
	return join(resolveAppHomeDir(), "local.db");
}

export function getAppStatePath(): string {
	return join(resolveAppHomeDir(), "app-state.json");
}
