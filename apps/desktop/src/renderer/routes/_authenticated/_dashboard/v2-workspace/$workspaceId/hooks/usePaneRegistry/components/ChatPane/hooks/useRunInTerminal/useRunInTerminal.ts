import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useV2TerminalLauncher } from "../../../../../useV2TerminalLauncher";

export function useRunInTerminal(
	split: RendererContext<PaneViewerData>["actions"]["split"],
): (command: string) => void {
	const { t } = useLingui();
	const launcher = useV2TerminalLauncher();
	return useCallback(
		(command: string) => {
			if (!command) {
				split("down", {
					kind: "terminal",
					data: {
						terminalId: launcher.mint(),
						createOnAttach: true,
					} as TerminalPaneData,
				});
				return;
			}
			launcher.create({ command }).then(
				(terminalId) =>
					split("down", {
						kind: "terminal",
						titleOverride: command,
						data: { terminalId } as TerminalPaneData,
					}),
				(error) =>
					toast.error(t({ message: "Couldn't open a terminal" }), {
						description: errorMessage(error, t({ message: "Unknown error" })),
					}),
			);
		},
		[launcher, split, t],
	);
}
