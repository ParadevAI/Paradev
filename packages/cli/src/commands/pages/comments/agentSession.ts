import { readPublicEnv } from "@superset/shared/public-env";

export function agentSessionId(): string | undefined {
	return readPublicEnv("PANE_ID") || readPublicEnv("TERMINAL_ID");
}
