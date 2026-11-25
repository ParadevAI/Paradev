import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import type { TerminalAttention } from "../useHostTerminals/attention";

/** What a screen reader says for an attention marker. */
export function useAttentionLabel() {
	const { t } = useLingui();
	return useCallback(
		(attention: TerminalAttention) => {
			switch (attention) {
				case "permission":
					return t({ message: "Needs input" });
				case "failed":
					return t({ message: "Failed" });
				case "working":
					return t({ message: "Working" });
				default:
					return t({ message: "Ready for review" });
			}
		},
		[t],
	);
}
