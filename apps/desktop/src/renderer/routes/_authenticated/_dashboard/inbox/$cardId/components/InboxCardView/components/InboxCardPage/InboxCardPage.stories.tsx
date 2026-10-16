import type { Meta, StoryObj } from "@storybook/react-vite";
import { InboxCardPage } from "./InboxCardPage";

const meta = {
	component: InboxCardPage,
	decorators: [
		(Story) => (
			<div className="h-[calc(100vh-3rem)] overflow-y-auto">
				<Story />
			</div>
		),
	],
	args: {
		title: "Wave map is ready to look at",
		why: "The map renders every wave; I need your eyes on the colours",
		sender: { name: "Claude", workspace: "Wave map" },
		body: null,
		outcome: null,
	},
} satisfies Meta<typeof InboxCardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithBody: Story = {
	args: {
		body: "I kept the three palettes from the brief.\nThe second one fails contrast on the legend, so I darkened two steps.",
	},
};

export const WithDocument: Story = {
	args: {
		children: (
			<div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
				Integration card
			</div>
		),
	},
};

export const FromSuperset: Story = {
	args: {
		title: "Nightly review sweep failed",
		why: "The run failed: target host offline",
		sender: { name: "Superset" },
	},
};

export const NoSender: Story = { args: { sender: null } };

export const Answered: Story = {
	args: { outcome: { label: "Answered", note: "Sent to the agent" } },
};

export const Archived: Story = { args: { outcome: { label: "Archived" } } };

export const LongContent: Story = {
	args: {
		title:
			"Regenerate-the-entire-wave-map-legend-with-the-new-palette-and-check-every-breakpoint-before-the-review",
		why: "A_very_long_reason_without_any_space_in_it_".repeat(6),
		sender: {
			name: "Claude",
			workspace: "a-workspace-with-a-very-long-name-that-must-truncate-".repeat(
				3,
			),
		},
		body: "A long body. ".repeat(80),
		outcome: {
			label: "Answered",
			note: "a_long_outcome_note_with_no_spaces_".repeat(6),
		},
	},
};
