import type { Meta, StoryObj } from "@storybook/react-vite";
import { issue, threadIssue, todo } from "../linearFixtures";
import { LinearIssueHeader } from "./LinearIssueHeader";

const meta = {
	component: LinearIssueHeader,
	args: { issue: threadIssue },
} satisfies Meta<typeof LinearIssueHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongTitle: Story = {
	args: {
		issue: issue(
			12,
			"Cloud workspace takes 40 s to open on mobile when the terminal restore runs before the first paint and the socket is half-open",
			todo,
		),
	},
	decorators: [
		(Story) => (
			<div className="max-w-md">
				<Story />
			</div>
		),
	],
};
