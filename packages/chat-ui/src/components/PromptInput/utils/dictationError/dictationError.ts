import type { PromptInputDictationError } from "../../types";

/** Reject `transcribe` with this to choose the message and whether retry is offered. */
export class DictationError extends Error implements PromptInputDictationError {
	readonly canRetry: boolean;

	constructor(message: string, { canRetry }: { canRetry: boolean }) {
		super(message);
		this.name = "DictationError";
		this.canRetry = canRetry;
	}
}
