import type { Meta, StoryObj } from "@storybook/react-vite";
import { LONG_DESCRIPTION, triageIssue } from "../linearFixtures";
import { LinearMarkdown } from "./LinearMarkdown";

const meta = {
	component: LinearMarkdown,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl">
					<Story />
				</div>
			</div>
		),
	],
	args: { text: triageIssue.description },
} satisfies Meta<typeof LinearMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bold, a numbered list, inline code and a checklist. */
export const Default: Story = {};

/** Headings, both bullet styles, a code block, a quote with a link, and a mention. */
export const Long: Story = {
	args: { text: LONG_DESCRIPTION, handles: ["marcus"] },
};
