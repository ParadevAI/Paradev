import { useLingui } from "@lingui/react/macro";

/** How a settled card's outcome reads, in the list and on its page. */
export function useInboxOutcomeLabel(): (kind: unknown) => string {
	const { t } = useLingui();
	return (kind) => {
		if (kind === "archived") return t({ message: "Archived" });
		if (kind === "resolved") return t({ message: "Resolved by the agent" });
		if (kind === "answered") return t({ message: "Answered" });
		return typeof kind === "string" ? kind : t({ message: "Done" });
	};
}
