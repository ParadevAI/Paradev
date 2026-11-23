export function resolveActivityPanelHidden(
	workspaceHidden: boolean | undefined,
	showActivityPanelAutomatically: boolean,
): boolean {
	return workspaceHidden ?? !showActivityPanelAutomatically;
}
