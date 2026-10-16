import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor } from "storybook/test";
import { bugDraft, followUpDraft } from "../handoffFixtures";
import { LinearDraftEditor } from "./LinearDraftEditor";
import { draftValue } from "./utils/draftInput";

const meta = {
	component: LinearDraftEditor,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-4">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		draft: bugDraft,
		value: draftValue(bugDraft),
		onChange: fn(),
		disabled: false,
	},
	render: function Render(args) {
		const [value, setValue] = useState(args.value);
		return (
			<LinearDraftEditor
				{...args}
				value={value}
				onChange={(next) => {
					setValue(next);
					args.onChange(next);
				}}
			/>
		);
	},
} satisfies Meta<typeof LinearDraftEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The agent's draft: title, description and the properties it suggests. */
export const Default: Story = {};

/** An assignee and a label the agent set; the status is left to the team's default. */
export const SuggestedPeople: Story = {
	args: { draft: followUpDraft, value: draftValue(followUpDraft) },
};

export const Edited: Story = {
	play: async ({ canvas, userEvent }) => {
		const title = canvas.getByLabelText("Title");
		await userEvent.clear(title);
		await userEvent.type(title, "Safari sign-in loop");
		await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
		await waitFor(() =>
			expect(canvas.getByLabelText("Description")).toBeVisible(),
		);
	},
};

export const EmptyTitle: Story = {
	args: { value: { ...draftValue(bugDraft), title: "" } },
};

/** Read-only, as it is once the issue is filed. */
export const Disabled: Story = { args: { disabled: true } };
