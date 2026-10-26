import type { ShipFormView } from "../../state/shipFormIntent";
import type { PRFlowState } from "../../utils/getPRFlowState";

export type OpenPrAction =
	| { kind: "open"; url: string }
	| { kind: "ship"; view: ShipFormView }
	| { kind: "none" };

export function resolveOpenPrAction(flowState: PRFlowState): OpenPrAction {
	switch (flowState.kind) {
		case "pr-exists":
			return { kind: "open", url: flowState.pr.url };
		case "busy":
		case "error":
			return flowState.pr
				? { kind: "open", url: flowState.pr.url }
				: { kind: "none" };
		case "no-pr":
			return {
				kind: "ship",
				view: flowState.sync.hasUncommitted ? "commit" : "pr",
			};
		case "loading":
		case "unavailable":
			return { kind: "none" };
	}
}
