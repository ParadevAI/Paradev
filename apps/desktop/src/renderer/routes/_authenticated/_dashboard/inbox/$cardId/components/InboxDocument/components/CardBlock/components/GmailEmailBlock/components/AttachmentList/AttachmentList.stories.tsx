import type { Meta, StoryObj } from "@storybook/react-vite";
import attachments from "../../realThreads/attachments.json";
import type { GmailEmailView } from "../../types";
import { AttachmentList } from "./AttachmentList";

const files =
	(attachments as GmailEmailView).thread?.messages[0]?.attachments ?? [];

const meta = {
	component: AttachmentList,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-2xl p-4">
				<Story />
			</div>
		),
	],
	args: { attachments: files },
} satisfies Meta<typeof AttachmentList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hover a card for its name, size and download. */
export const TwoFiles: Story = {};

export const One: Story = {
	args: { attachments: files.slice(0, 1) },
};

/** A file on Gmail's blocked list shows as blocked, with no download. */
export const Blocked: Story = {
	args: {
		attachments: [
			...files.slice(0, 1),
			{
				partId: "9",
				filename: "setup.exe",
				mimeType: "application/x-msdownload",
				size: 48_000,
				url: "",
				blocked: true,
			},
		],
	},
};
