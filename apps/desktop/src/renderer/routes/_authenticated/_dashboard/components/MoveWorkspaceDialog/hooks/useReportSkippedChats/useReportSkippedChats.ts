import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";

/** Says which chats stayed in the old workspace because they could not move. */
export function useReportSkippedChats() {
	const { t } = useLingui();
	return useCallback(
		(skipped: { title: string | null }[]) => {
			if (skipped.length === 0) return;
			toast.info(
				t({
					message: plural(skipped.length, {
						one: "# chat stayed in the old workspace",
						other: "# chats stayed in the old workspace",
					}),
				}),
				{
					description: skipped
						.map((chat) => chat.title ?? t({ message: "Untitled chat" }))
						.join(", "),
				},
			);
		},
		[t],
	);
}
