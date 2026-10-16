import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { flickerIssue, members, triageIssue } from "../../../linearFixtures";
import { DuplicateConfirm } from "./DuplicateConfirm";

const meta = {
	component: DuplicateConfirm,
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
		issue: triageIssue,
		original: flickerIssue,
		members,
		action: {
			id: "duplicate",
			label: "Mark as duplicate",
			style: "secondary",
			role: "other",
		},
		pending: false,
		onConfirm: fn(),
		onCancel: fn(),
	},
} satisfies Meta<typeof DuplicateConfirm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Pending: Story = { args: { pending: true } };
