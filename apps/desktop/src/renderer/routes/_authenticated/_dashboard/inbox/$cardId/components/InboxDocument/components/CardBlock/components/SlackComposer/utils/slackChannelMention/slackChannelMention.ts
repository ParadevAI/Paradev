import { Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CHANNEL_PREFIX } from "../mrkdwnConvert";

/**
 * `#channel` in a reply: one piece that Backspace removes whole, kept in the
 * markdown as a link to the channel's id so it posts as Slack's `<#C…>`. A
 * link mark would not do, the editor drops hrefs it does not know.
 */
export const SlackChannelMention = Node.create({
	name: "slackChannel",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,

	addAttributes() {
		return { id: { default: null }, label: { default: "" } };
	},

	parseHTML() {
		return [
			{
				tag: `a[href^="${CHANNEL_PREFIX}"]`,
				priority: 101,
				getAttrs: (element) => ({
					id: element.getAttribute("href")?.slice(CHANNEL_PREFIX.length),
					label: (element.textContent ?? "").replace(/^#/, ""),
				}),
			},
		];
	},

	renderHTML({ node }) {
		return [
			"span",
			{
				"data-channel": node.attrs.id,
				class:
					"rounded-[3px] bg-sky-500/15 px-0.5 text-blue-500 dark:text-sky-300",
			},
			`#${node.attrs.label}`,
		];
	},

	renderText({ node }) {
		return `#${node.attrs.label}`;
	},

	addStorage() {
		return {
			markdown: {
				serialize(
					state: { write: (text: string) => void },
					node: ProseMirrorNode,
				) {
					state.write(
						`[#${node.attrs.label}](${CHANNEL_PREFIX}${node.attrs.id})`,
					);
				},
				parse: {},
			},
		};
	},
});
