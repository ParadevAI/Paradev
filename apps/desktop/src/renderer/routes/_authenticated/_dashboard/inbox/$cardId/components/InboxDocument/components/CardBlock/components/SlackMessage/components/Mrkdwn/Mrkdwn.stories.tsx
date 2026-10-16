import type { Meta, StoryObj } from "@storybook/react-vite";
import { SlackWorkspaceProvider } from "../../../../providers/SlackWorkspaceProvider";
import { workspace } from "../../../SlackThreadBlock/fixtures";
import { Mrkdwn } from "./Mrkdwn";

const meta = {
	component: Mrkdwn,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-xl text-[13px] leading-relaxed text-foreground">
				<SlackWorkspaceProvider {...workspace}>
					<Story />
				</SlackWorkspaceProvider>
			</div>
		),
	],
	args: {
		text: "",
	},
} satisfies Meta<typeof Mrkdwn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Marks: Story = {
	args: { text: "*bold* _italic_ ~struck~ `code` and plain" },
};

export const MentionsAndLinks: Story = {
	args: {
		text: "<@U0AVERY4C1N> in <#C0GEN|general>, see <https://superset.sh|the site> <!here>",
	},
};

export const CodeBlock: Story = {
	args: { text: "Run:\n```\nsuperset login\nsuperset inbox wait\n```" },
};

export const Emoji: Story = {
	args: { text: "standard :tada: custom :partyparrot: unknown :not_an_emoji:" },
};

/** Slack's own `/shrug` escapes the underscore so the arm is not italic. */
export const Shrug: Story = {
	args: { text: "no idea ¯\\_(ツ)_/¯" },
};

/** A blank line is a short paragraph gap, not a full empty line. */
export const Paragraphs: Story = {
	args: {
		text: "*What problem are you trying to solve?*\n\nThe setup tab stays open after setup finishes.\nIt has to be closed by hand.",
	},
};
