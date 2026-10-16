import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
	canvasActions,
	canvasAppendView,
	canvasDeleteView,
	canvasInsertView,
	canvasView,
	off,
	READ_ONLY_CANVAS,
} from "../slackApprovalFixtures";
import { SlackCanvasBlock } from "./SlackCanvasBlock";

const meta = {
	component: SlackCanvasBlock,
	decorators: [
		(Story) => (
			<div className="-m-6 h-screen overflow-y-auto p-6">
				<div className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
					<Story />
				</div>
			</div>
		),
	],
	args: {
		view: canvasView,
		actions: canvasActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof SlackCanvasBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const clicks =
	(name: string): Story["play"] =>
	async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name }));
	};

/** One part of the canvas is replaced: the words that change are marked. */
export const Replace: Story = {};

export const Confirming: Story = { play: clicks("Apply to canvas") };

/** New text after a part: the part shows above it, unchanged. */
export const InsertAfter: Story = { args: { view: canvasInsertView } };

/** New text at the end, under the canvas's last line. */
export const Append: Story = { args: { view: canvasAppendView } };

export const Remove: Story = { args: { view: canvasDeleteView } };

export const Editing: Story = { play: clicks("Edit") };

export const WholeCanvas: Story = { play: clicks("Show the whole canvas") };

/** Hover "Apply to canvas" for the reason. */
export const ReadOnly: Story = {
	args: {
		view: { ...canvasView, editable: false },
		actions: off(canvasActions, "apply", READ_ONLY_CANVAS),
	},
};

export const Resolved: Story = { args: { done: true } };

export const Pending: Story = { args: { pending: true } };

export const Failure: Story = {
	args: {
		failure:
			"This canvas was edited since you looked. Read it again before you apply",
	},
};
