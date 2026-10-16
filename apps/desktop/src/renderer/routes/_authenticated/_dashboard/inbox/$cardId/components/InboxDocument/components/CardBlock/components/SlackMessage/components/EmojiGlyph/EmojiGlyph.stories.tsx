import type { Meta, StoryObj } from "@storybook/react-vite";
import { customEmoji } from "../../../SlackThreadBlock/fixtures";
import { EmojiGlyph } from "./EmojiGlyph";

const meta = {
	component: EmojiGlyph,
	decorators: [
		(Story) => (
			<div className="text-2xl">
				<Story />
			</div>
		),
	],
	args: { name: "tada", emoji: customEmoji },
} satisfies Meta<typeof EmojiGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};

export const WorkspaceCustom: Story = {
	args: { name: "partyparrot" },
	decorators: [
		(Story) => (
			<span className="inline-flex items-center gap-2 text-sm">
				<Story />
				:partyparrot:
			</span>
		),
	],
};

/** Not standard, not in the workspace: shown as its shortcode, the way Slack does. */
export const Unknown: Story = {
	args: { name: "not_an_emoji" },
};
