export type SlackLink =
	| { kind: "message"; channel: string; ts: string; threadTs: string | null }
	| { kind: "user"; user: string };

const SLACK_HOST = /^[a-z0-9-]+(\.enterprise)?\.slack\.com$/i;
const NOT_A_WORKSPACE = new Set(["www", "api", "status", "app"]);
const MESSAGE_PATH = /^\/archives\/([CDG][A-Z0-9]+)\/p(\d{7,})\/?$/;
const USER_PATH = /^\/team\/([UW][A-Z0-9]+)\/?$/;
const SLACK_TS = /^\d+\.\d+$/;

/** A link to one Slack message or one person's profile, or null. */
export function parseSlackLink(href: string): SlackLink | null {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return null;
	}
	const workspace = url.hostname.split(".")[0]?.toLowerCase() ?? "";
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.port ||
		!SLACK_HOST.test(url.hostname) ||
		NOT_A_WORKSPACE.has(workspace)
	) {
		return null;
	}
	const message = MESSAGE_PATH.exec(url.pathname);
	if (message) {
		const [, channel = "", digits = ""] = message;
		const threadTs = url.searchParams.get("thread_ts");
		return {
			kind: "message",
			channel,
			ts: `${digits.slice(0, -6)}.${digits.slice(-6)}`,
			threadTs: threadTs && SLACK_TS.test(threadTs) ? threadTs : null,
		};
	}
	const user = USER_PATH.exec(url.pathname)?.[1];
	return user ? { kind: "user", user } : null;
}
