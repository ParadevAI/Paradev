import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { slashEntries } from "../../utils/slashCommands";
import { SlashCommandMenu } from "./SlashCommandMenu";

const LABELS = {
	invite: "Invite someone to this channel",
	topic: "Edit this channel’s topic",
	away: "Set yourself as away",
};

const meta = {
	component: SlashCommandMenu,
	decorators: [
		(Story) => (
			<div className="relative mx-auto mt-72 max-w-xl">
				<Story />
				<div className="rounded-lg border border-input bg-background px-3 py-2 text-[13px]">
					/
				</div>
			</div>
		),
	],
	args: {
		entries: slashEntries("", LABELS),
		selected: 0,
		onHover: fn(),
		onPick: fn(),
	},
} satisfies Meta<typeof SlashCommandMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllCommands: Story = {};

/** `/re`: two commands that only work inside Slack, greyed with why. */
export const OnlyInSlack: Story = {
	args: { entries: slashEntries("re", LABELS) },
};

/** `/s`: `/shrug`, then the shortcuts with a word starting with s. */
export const Filtered: Story = {
	args: { entries: slashEntries("s", LABELS), selected: 1 },
};

export const NoMatch: Story = {
	args: { entries: [] },
};
