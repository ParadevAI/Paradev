import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import {
	releaseActions,
	releaseDraftedNotesView,
	releasedActions,
	releasedView,
	releaseExistingTagView,
	releasePrereleaseView,
	releaseView,
} from "../githubFixtures";
import { GithubReleaseBlock } from "./GithubReleaseBlock";

const meta = {
	component: GithubReleaseBlock,
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
		view: releaseView,
		actions: releaseActions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
	},
} satisfies Meta<typeof GithubReleaseBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const clicks =
	(...names: (string | RegExp)[]): Story["play"] =>
	async ({ canvas, userEvent }) => {
		for (const name of names) {
			const button = await canvas.findByRole("button", { name });
			await waitFor(() => expect(button).toBeEnabled());
			await userEvent.click(button);
		}
	};

const edit: Story["play"] = async ({ canvas }) => {
	const title = await canvas.findByLabelText("Title");
	await userEvent.clear(title);
	await userEvent.type(title, "Lumen 2.4: steadier sync");
	await userEvent.click(await canvas.findByRole("button", { name: "Edit" }));
	const notes = await canvas.findByLabelText("Release notes");
	await userEvent.clear(notes);
	await userEvent.type(
		notes,
		"## Highlights\n- The sync queue writes again when it loses the lease\n- The sidebar keeps its width",
	);
};

/** Publishing makes the tag. */
export const Default: Story = {};

export const ExistingTag: Story = { args: { view: releaseExistingTagView } };

export const EditedTitleAndNotes: Story = { play: edit };

export const PreRelease: Story = { args: { view: releasePrereleaseView } };

export const NoTitle: Story = {
	play: async ({ canvas }) => {
		await userEvent.clear(await canvas.findByLabelText("Title"));
	},
};

export const PublishConfirming: Story = { play: clicks("Publish release") };

export const DraftConfirming: Story = { play: clicks("Save draft") };

/** GitHub is writing the notes. */
export const Generating: Story = { args: { pending: true } };

/** The agent's notes would be replaced, so generating asks first. */
export const GenerateConfirming: Story = {
	args: { view: releaseDraftedNotesView },
	play: clicks("Generate release notes"),
};

export const AlreadyReleased: Story = {
	args: { view: releasedView, actions: releasedActions },
};

export const Done: Story = { args: { done: true } };
