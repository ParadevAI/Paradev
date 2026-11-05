import * as p from "@clack/prompts";
import { wrapText } from "@superset/cli-framework";

const wrap = (text: string) =>
	wrapText(text, (process.stdout.columns || 80) - 4);

export const log = {
	info: (text: string) => p.log.info(wrap(text)),
	success: (text: string) => p.log.success(wrap(text)),
	warn: (text: string) => p.log.warn(wrap(text)),
	outro: (text: string) => p.outro(wrap(text)),
};
