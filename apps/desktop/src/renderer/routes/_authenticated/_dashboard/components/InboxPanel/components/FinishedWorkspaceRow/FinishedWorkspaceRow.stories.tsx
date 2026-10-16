import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FinishedWorkspaceRow } from "./FinishedWorkspaceRow";

const now = new Date("2037-10-01T19:00:00Z");

const meta = {
	component: FinishedWorkspaceRow,
	decorators: [
		(Story) => (
			<div className="w-[400px] bg-sidebar p-3 dark:bg-muted/35">
				<Story />
			</div>
		),
	],
	args: {
		itemId: "finished-wave-map",
		selected: false,
		workspaceName: "Wave map",
		finishedAt: new Date("2037-10-01T18:15:00Z"),
		now,
		onOpen: fn(),
		onDismiss: fn(),
	},
} satisfies Meta<typeof FinishedWorkspaceRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

export const WithTheAgentsNote: Story = {
	args: { note: "The legend now passes contrast on all three palettes" },
};

export const JustNow: Story = { args: { finishedAt: now } };

export const LongContent: Story = {
	args: {
		workspaceName:
			"Regenerate the entire wave map legend with the new palette and check every breakpoint",
		note: "A long note from the agent about what it did in this turn. ".repeat(
			6,
		),
	},
};
