import { spawn } from "node:child_process";
import { env } from "./env";

/**
 * A cloud workspace sandbox ships `xdg-utils` and sets `DISPLAY`, so
 * `xdg-open` spawns happily and the page lands on a display nobody is
 * looking at. The same goes for an SSH session. Neither failure is one the
 * launcher can report, so it has to be ruled out before spawning.
 */
export function canReachDesktop(): boolean {
	return !(
		process.env.IS_SANDBOX ||
		process.env.SSH_CONNECTION ||
		process.env.SSH_TTY
	);
}

export function desktopWorkspaceLink(
	workspaceId: string,
	options?: { sessionId?: string },
): string {
	const base = `superset://v2-workspace/${workspaceId}`;
	if (!options?.sessionId) return base;
	const params = new URLSearchParams({ sessionId: options.sessionId });
	return `${base}?${params.toString()}`;
}

export function workspaceLinks(workspaceId: string): {
	url: string;
	webUrl: string;
} {
	return {
		url: desktopWorkspaceLink(workspaceId),
		webUrl: new URL(
			`/workspaces/${workspaceId}`,
			env.SUPERSET_WEB_URL,
		).toString(),
	};
}

export function openUrl(url: string): Promise<void> {
	const [bin, args]: [string, string[]] =
		process.platform === "darwin"
			? ["open", [url]]
			: process.platform === "win32"
				? ["cmd", ["/c", "start", "", url]]
				: ["xdg-open", [url]];

	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { stdio: "ignore", detached: true });
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}
