/** host-service.log leaves a cloud box, so a hook line names the outcome and never the repository's command. */
export function hookOutcomeLine(
	hook: "start" | "archive",
	outcome: string,
	command: string,
): string {
	return `[sandbox] ${hook} hook ${outcome} (command of ${command.length} chars)`;
}
