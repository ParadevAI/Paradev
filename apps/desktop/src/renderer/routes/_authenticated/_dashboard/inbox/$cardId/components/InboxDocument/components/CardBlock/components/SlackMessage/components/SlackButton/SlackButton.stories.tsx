import type { Meta, StoryObj } from "@storybook/react-vite";
import { SlackButton } from "./SlackButton";

const meta = {
	component: SlackButton,
	decorators: [
		(Story) => (
			<div className="p-4">
				<Story />
			</div>
		),
	],
	args: {
		button: { text: "Comment", url: null, style: null },
		permalink: "https://superset.slack.com/archives/C0BUGS/p1790840502000000",
	},
} satisfies Meta<typeof SlackButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = {
	args: { button: { text: "Approve", url: null, style: "primary" } },
};

export const Danger: Story = {
	args: { button: { text: "Close", url: null, style: "danger" } },
};

/** No url and no message link: nothing to open. */
export const Inert: Story = {
	args: { permalink: null },
};
