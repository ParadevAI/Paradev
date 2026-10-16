import type { Meta, StoryObj } from "@storybook/react-vite";
import { DisputeDeadline } from "./DisputeDeadline";

const DAY_MS = 24 * 60 * 60_000;

const meta = {
	component: DisputeDeadline,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: { dueBy: "2037-10-20T12:00:00.000Z", pastDue: false },
} satisfies Meta<typeof DisputeDeadline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Under three days left reads red. */
export const Urgent: Story = {
	args: { dueBy: new Date(Date.now() + 2 * DAY_MS).toISOString() },
};

export const LastDay: Story = {
	args: { dueBy: new Date(Date.now() + DAY_MS / 2).toISOString() },
};

export const Passed: Story = {
	args: { dueBy: "2025-09-20T12:00:00.000Z", pastDue: true },
};
