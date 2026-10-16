import type { Meta, StoryObj } from "@storybook/react-vite";
import { editView, LONG_DESCRIPTION } from "../../../linearFixtures";
import { DescriptionDiff } from "./DescriptionDiff";

const meta = {
	component: DescriptionDiff,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		before: editView.issue.description,
		after: editView.proposed.description ?? "",
	},
} satisfies Meta<typeof DescriptionDiff>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FromNothing: Story = {
	args: { before: "", after: LONG_DESCRIPTION },
};

export const Removed: Story = {
	args: { before: LONG_DESCRIPTION, after: "## What happens" },
};
