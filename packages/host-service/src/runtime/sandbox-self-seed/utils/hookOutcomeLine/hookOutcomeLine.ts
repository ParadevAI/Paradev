/** host-service.log leaves a cloud box, so a hook line names the outcome and never the repository's command. */
export function hookOutcomeLine(
	hook: "start" | "archive",
	outcome: string,
	command: string,
) {
	return [
		"[sandbox] hook outcome (hook, outcome, command chars):",
		hook,
		outcome,
		command.length,
	] as const;
}
