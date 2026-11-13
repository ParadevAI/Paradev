import { useLingui } from "@lingui/react/macro";
import { useOpenNewSession } from "renderer/hooks/useOpenNewWorkspace";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";

export function useStartCliTour() {
	const { t } = useLingui();
	const openNewSession = useOpenNewSession();

	return () => {
		const draftStore = useNewWorkspaceDraftStore.getState();
		draftStore.resetDraft();
		draftStore.updateDraft({
			promptDraft: [
				{
					type: "text",
					text: t({
						message:
							"Show me what the Paradev CLI can do. Run `superset --help` and `superset schema` to see its commands, then try a few read-only ones on my account: `superset workspaces list`, `superset tasks list`, `superset automations list` and `superset hosts list`. Summarize what you found and suggest three ways I could use or script the CLI in my workflow. Do not create, change or delete anything.",
					}),
				},
			],
		});
		openNewSession();
	};
}
