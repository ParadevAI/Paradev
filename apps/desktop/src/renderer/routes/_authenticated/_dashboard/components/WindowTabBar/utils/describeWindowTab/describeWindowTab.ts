import type { WindowTab, WindowTabKind } from "renderer/stores/window-tabs";

const SECTION_TABS: ReadonlyArray<
	readonly [path: string, kind: WindowTabKind]
> = [
	["/new-workspace", "home"],
	["/v2-workspaces", "workspaces"],
	["/channels", "channels"],
	["/devs", "devs"],
	["/tasks", "tasks"],
	["/pull-requests", "pull-requests"],
	["/pages", "pages"],
	["/automations", "automations"],
	["/plugins", "plugins"],
	["/projects", "projects"],
	["/environments", "environments"],
	["/cloud-workspaces", "cloud-workspaces"],
];

/** The tab a pathname shows in: one per workspace, one per section, none for v1 screens. */
export function describeWindowTab(
	pathname: string,
): Omit<WindowTab, "href"> | null {
	const workspace = /^\/v2-workspace\/([^/]+)/.exec(pathname);
	if (workspace?.[1]) {
		const workspaceId = decodeURIComponent(workspace[1]);
		return { id: `workspace:${workspaceId}`, kind: "workspace", workspaceId };
	}
	for (const [path, kind] of SECTION_TABS) {
		if (pathname === path || pathname.startsWith(`${path}/`)) {
			return { id: kind, kind };
		}
	}
	return null;
}
