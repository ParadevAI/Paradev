import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LinkEditor } from "./LinkEditor";

const meta = {
	component: LinkEditor,
	decorators: [
		(Story) => (
			<div className="relative mx-auto mt-64 h-24 max-w-2xl rounded-lg border border-input">
				<Story />
			</div>
		),
	],
	args: {
		initial: { text: "docs", url: "", existing: false },
		onSave: fn(),
		onRemove: fn(),
		onCancel: fn(),
	},
} satisfies Meta<typeof LinkEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** ⌘K or ⌘⇧U with words selected: they become the link's text. */
export const AddLink: Story = {};

/** On a link already in the reply: change it or take it off. */
export const EditLink: Story = {
	args: {
		initial: { text: "docs", url: "https://superset.sh/docs", existing: true },
	},
};
