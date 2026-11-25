import { expect, test } from "bun:test";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import { renderToStaticMarkup } from "react-dom/server";
import { remarkWorkspaceDeepLinks } from "./remarkWorkspaceDeepLinks";

const WEB_URL = "https://app.superset.sh";
const ID = "7caaacb5-3d77-4d1f-aaa6-8e194158e8a7";

function render(markdown: string): string {
	return renderToStaticMarkup(
		<ChatMarkdown
			remarkPlugins={[[remarkWorkspaceDeepLinks, { webUrl: WEB_URL }]]}
		>
			{markdown}
		</ChatMarkdown>,
	);
}

function hrefs(markdown: string): string[] {
	return [...render(markdown).matchAll(/href="([^"]*)"/g)].map(
		(match) => match[1] ?? "",
	);
}

test("a workspace deep link becomes the workspace's web link", () => {
	expect(
		hrefs(
			`[open](superset://v2-workspace/${ID}) [new](paradev://workspace/${ID})`,
		),
	).toEqual([`${WEB_URL}/workspaces/${ID}`, `${WEB_URL}/workspaces/${ID}`]);
});

test("a bare deep link in prose is linked", () => {
	expect(hrefs(`See superset://v2-workspace/${ID}.`)).toEqual([
		`${WEB_URL}/workspaces/${ID}`,
	]);
});

test("a deep link to one chat keeps its session", () => {
	expect(hrefs(`superset://v2-workspace/${ID}?sessionId=abc123`)).toEqual([
		`${WEB_URL}/workspaces/${ID}?sessionId=abc123`,
	]);
});

test("a deep link in code and other deep links stay as they are", () => {
	expect(
		hrefs(
			`\`superset://v2-workspace/${ID}\` [auth](superset://auth/callback) superset://tasks/x`,
		),
	).toEqual([]);
});

test("an autolink shows the web link, so the chat can name the workspace", () => {
	const html = render(`<superset://v2-workspace/${ID}>`);
	expect(html).toContain(`>${WEB_URL}/workspaces/${ID}</a>`);
	expect(html).not.toContain("superset://");
});
