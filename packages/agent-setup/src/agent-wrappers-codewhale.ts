import { buildWrapperScript, createWrapper } from "./agent-wrappers-common";

export function createCodewhaleWrapper(): void {
	createWrapper(
		"codewhale",
		buildWrapperScript("codewhale", 'exec "$REAL_BIN" "$@"', {
			agentId: "codewhale",
		}),
	);
}
