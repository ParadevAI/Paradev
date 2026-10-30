import type { RouterDev, RouterMessage } from "../../channelRouter";

export type EvalKind =
	| "chatter"
	| "direct"
	| "multi"
	| "ambiguous"
	| "followup"
	| "passing-mention"
	| "sarcasm";

export interface EvalCase {
	id: string;
	kind: EvalKind;
	channelName: string;
	devs: RouterDev[];
	recent: RouterMessage[];
	message: RouterMessage;
	expected: string[];
}

export function m(authorName: string, body: string): RouterMessage {
	return { authorName, body };
}
