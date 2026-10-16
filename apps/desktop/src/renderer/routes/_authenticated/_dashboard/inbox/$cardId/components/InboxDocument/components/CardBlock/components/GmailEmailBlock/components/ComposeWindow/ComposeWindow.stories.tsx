import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { composeView, sendAs } from "../../fixtures";
import { ComposeWindow } from "./ComposeWindow";

const draftFiles = [
	{
		partId: "2",
		filename: "projector-manual.pdf",
		mimeType: "application/pdf",
		size: 482_133,
		url: "https://example.com/projector-manual.pdf",
		blocked: false,
	},
	{
		partId: "3",
		filename: "driver-setup.exe",
		mimeType: "application/x-msdownload",
		size: 1_204_224,
		url: "https://example.com/driver-setup.exe",
		blocked: true,
	},
];

const meta = {
	component: ComposeWindow,
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
		draft: composeView.draft,
		sendAs,
		known: [],
		gmailUrl: "https://mail.google.com/",
		pending: false,
		failure: null,
		onSend: fn(),
		onSaveDraft: fn(),
		onSchedule: fn(),
		onRemoveBlockedAndSend: fn(),
		onDiscard: fn(),
	},
} satisfies Meta<typeof ComposeWindow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDraft: Story = {};

export const Blank: Story = {
	args: {
		draft: { ...composeView.draft, to: [], cc: [], subject: "", body: "" },
	},
};

export const Failed: Story = {
	args: { failure: "Add someone to send it to" },
};

/** A file Gmail blocks: Send waits, and the bar offers to drop it and send. */
export const BlockedFile: Story = {
	args: { draft: { ...composeView.draft, attachments: draftFiles } },
};

/** Two send-as addresses: Gmail's From row appears. */
export const WithAliases: Story = {
	args: {
		sendAs: [
			...sendAs,
			{
				email: "hello@superset.sh",
				name: "Superset Team",
				isDefault: false,
				signature: "<div>The Superset team</div>",
			},
		],
	},
};
