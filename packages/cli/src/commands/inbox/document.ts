import { readFileSync } from "node:fs";
import { CLIError } from "@superset/cli-framework";
import type { RouterInputs } from "@superset/trpc";

export type BlockDocument = RouterInputs["inbox"]["setDocument"]["document"];

/**
 * Reads a block document off disk and checks only its envelope; the API owns
 * the block schema and names the first offending block.
 */
export function readDocument(path: string): BlockDocument {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new CLIError(
			`${path} is not valid JSON`,
			error instanceof Error ? error.message : undefined,
		);
	}
	const doc = parsed as Partial<BlockDocument> | null;
	if (
		!doc ||
		doc.object !== "page" ||
		doc.kind !== "blocks" ||
		!Array.isArray(doc.blocks)
	) {
		throw new CLIError(
			`${path} is not a block document`,
			'Expected {"object":"page","kind":"blocks","format_version":"…","blocks":[…]}',
		);
	}
	return {
		object: "page",
		kind: "blocks",
		format_version: doc.format_version ?? "2026-09-15",
		blocks: doc.blocks,
	};
}
