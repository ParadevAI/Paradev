const TASK_PREFIX = /^\/task(\s|$)/i;

export function hasTaskPrefix(text: string): boolean {
	return TASK_PREFIX.test(text.trimStart());
}

/** Turns a draft into a `/task` command, keeping what was typed; already-prefixed drafts are left alone. */
export function withTaskPrefix(text: string): string {
	return hasTaskPrefix(text) ? text : `/task ${text.trimStart()}`;
}
