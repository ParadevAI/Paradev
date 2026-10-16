import type { Meta, StoryObj } from "@storybook/react-vite";
import { SlackWorkspaceProvider } from "../../../../providers/SlackWorkspaceProvider";
import { messages, workspace } from "../../../SlackThreadBlock/fixtures";
import githubInBugs from "../../../SlackThreadBlock/realThreads/github-in-bugs.json";
import type { SlackAttachmentView } from "../../types";
import { SlackAttachment } from "./SlackAttachment";

const issue = (githubInBugs as { messages: { attachments: unknown[] }[] })
	.messages[0].attachments[0] as SlackAttachmentView;

const meta = {
	component: SlackAttachment,
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-2xl p-4">
				<SlackWorkspaceProvider {...workspace}>
					<Story />
				</SlackWorkspaceProvider>
			</div>
		),
	],
	args: {
		attachment: issue,
		asOf: "As of today at 1:28 PM",
		sentAt: "Today at 1:28 PM",
		permalink: "https://superset.slack.com/archives/C0BUGS/p1790840502000000",
	},
} satisfies Meta<typeof SlackAttachment>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A real GitHub issue post: linked title, long text folded behind "Show more", a danger button. */
export const GitHubIssue: Story = {};

export const PullRequestWithFields: Story = {
	args: {
		attachment: messages.pullRequest.attachments[0] as SlackAttachmentView,
	},
};

export const WithoutPermalink: Story = {
	args: { permalink: null },
};

/** A pasted link's preview: title, description, the site and its image. */
export const LinkPreview: Story = {
	args: {
		attachment: messages.linkPreview.attachments[0] as SlackAttachmentView,
	},
};
