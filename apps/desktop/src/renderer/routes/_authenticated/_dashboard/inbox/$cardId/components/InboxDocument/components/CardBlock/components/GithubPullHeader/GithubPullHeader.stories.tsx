import type { Meta, StoryObj } from "@storybook/react-vite";
import { forkPull, pull } from "../githubFixtures";
import { GithubPullHeader } from "./GithubPullHeader";

const meta = {
	component: GithubPullHeader,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
				<Story />
			</div>
		),
	],
	args: { pull },
} satisfies Meta<typeof GithubPullHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Draft: Story = { args: { pull: { ...pull, draft: true } } };
export const Merged: Story = { args: { pull: { ...pull, state: "merged" } } };
export const Closed: Story = { args: { pull: { ...pull, state: "closed" } } };
export const FromFork: Story = { args: { pull: forkPull } };
export const NoAuthor: Story = { args: { pull: { ...pull, author: null } } };
