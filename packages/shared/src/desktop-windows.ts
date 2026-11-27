export const DESKTOP_WINDOW_VIEWS = [
	"workspace",
	"cloud-workspace",
	"other",
] as const;
export type DesktopWindowView = (typeof DESKTOP_WINDOW_VIEWS)[number];

export interface DesktopWindow {
	id: number;
	focused: boolean;
	lastFocused: boolean;
	/** Shown on screen and not minimized. Other windows can still cover it. */
	visible: boolean;
	view: DesktopWindowView;
	workspaceId: string | null;
	/** Filled in by the host for workspaces it knows. */
	workspaceName?: string | null;
	route: string;
}

const WORKSPACE_ROUTES: [RegExp, DesktopWindowView][] = [
	[/^\/(?:v2-)?workspace\/([^/?#]+)/, "workspace"],
	[/^\/cloud-workspaces\/([^/?#]+)/, "cloud-workspace"],
];

export function parseDesktopWindowRoute(url: string): {
	route: string;
	view: DesktopWindowView;
	workspaceId: string | null;
} {
	let route = "/";
	try {
		route = new URL(url).hash.replace(/^#/, "") || "/";
	} catch {}
	for (const [pattern, view] of WORKSPACE_ROUTES) {
		const encoded = pattern.exec(route)?.[1];
		if (!encoded) continue;
		try {
			return { route, view, workspaceId: decodeURIComponent(encoded) };
		} catch {
			break;
		}
	}
	return { route, view: "other", workspaceId: null };
}
