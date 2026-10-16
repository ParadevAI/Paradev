import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { replyComment, rootComment } from "../../../linearFixtures";
import { LinearComment } from "./LinearComment";

const meta = {
	component: LinearComment,
	args: { comment: rootComment, handles: ["riya"], onReact: fn() },
} satisfies Meta<typeof LinearComment>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Root: Story = {};
export const Reply: Story = { args: { comment: replyComment, reply: true } };
export const ReadOnly: Story = { args: { onReact: undefined } };
export const Edited: Story = {
	args: { comment: { ...replyComment, edited: true, reactions: [] } },
};
export const NoAuthor: Story = {
	args: { comment: { ...replyComment, author: null } },
};
