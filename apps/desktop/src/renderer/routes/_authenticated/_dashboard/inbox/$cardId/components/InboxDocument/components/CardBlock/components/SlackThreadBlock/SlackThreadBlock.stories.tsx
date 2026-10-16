import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CardStoryFrame } from "../cardStoryKit";
import type { SlackMessageView } from "../SlackMessage";
import { actions, messages, people, thread } from "./fixtures";
import appsInTestAgents from "./realThreads/apps-in-test-agents.json";
import githubInBugs from "./realThreads/github-in-bugs.json";
import onCallPaging from "./realThreads/on-call-paging.json";
import prButtonDiscussion from "./realThreads/pr-button-discussion.json";
import supersetAgentTicket from "./realThreads/superset-agent-ticket.json";
import { SlackThreadBlock, type SlackThreadView } from "./SlackThreadBlock";

const meta = {
	component: SlackThreadBlock,
	render: (args) => (
		<CardStoryFrame title={args.view.channel.name}>
			{(headerSlot) => <SlackThreadBlock {...args} headerSlot={headerSlot} />}
		</CardStoryFrame>
	),
	args: {
		headerSlot: null,
		view: thread(),
		actions,
		done: false,
		pending: false,
		failure: null,
		onAct: fn(),
		onConnect: fn(),
	},
} satisfies Meta<typeof SlackThreadBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The agent's draft waits in the composer; reactions, a file and a custom emoji in the thread. */
export const WithDraft: Story = {};

/** Nothing proposed: the reader writes the reply from scratch. */
export const EmptyComposer: Story = {
	args: { view: thread({ draft: null }) },
};

export const Formatting: Story = {
	args: {
		view: thread({
			messages: [messages.question, messages.formatted, messages.fromApp],
			draft: null,
		}),
	},
};

/** Restamps fixture messages two minutes apart, in the order given, as a thread arrives. */
function inOrder(list: SlackMessageView[]): SlackMessageView[] {
	const start = Date.now() / 1000 - list.length * 120;
	return list.map((m, i) => ({ ...m, ts: (start + i * 120).toFixed(6) }));
}

/** Shaped after a real thread: grouped follow-ups, link pills, an app attachment, a broadcast reply. */
export const RealisticThread: Story = {
	args: {
		view: thread({
			draft: null,
			messages: inOrder([
				messages.links,
				messages.willDo,
				messages.question,
				messages.reply,
				messages.followUp,
				messages.pullRequest,
				messages.linkPreview,
				messages.merged,
			]),
		}),
	},
};

export const LongThread: Story = {
	args: {
		view: thread({
			messages: [
				messages.question,
				...Array.from({ length: 19 }, (_, i) => ({
					...messages.followUp,
					ts: (Number.parseFloat(messages.followUp.ts) + i * 60).toFixed(6),
					user: i % 2 ? people.casey : people.satya,
					text: `Reply ${i + 1}: still think the login should carry over, ${i % 3 ? "no new key" : "and the 401 is a separate bug"}.`,
					edited: false,
					files: [],
				})),
				messages.fromApp,
			],
		}),
	},
};

/** Files in a message: an image under its name, a PDF as a card. */
export const Files: Story = {
	args: {
		view: thread({
			draft: null,
			messages: [
				messages.question,
				messages.withFiles,
				messages.mentionsChannel,
			],
		}),
	},
};

/** The root was deleted after people replied; Slack keeps a placeholder. */
export const DeletedRoot: Story = {
	args: {
		view: thread({
			draft: null,
			messages: [messages.deletedRoot, messages.reply],
		}),
	},
};

/** Slack refused the reply: the reason sits by the send button and the text stays. */
export const SendFailed: Story = {
	args: { failure: "Slack answered not_in_channel" },
};

/** The reader already replied or left it; the thread stays readable, the composer and "Leave it" are gone. */
export const Replied: Story = {
	args: { done: true },
};

export const Sending: Story = {
	args: { pending: true },
};

/** A workspace without `emoji:read` yet: custom emoji fall back to their shortcodes. */
export const WithoutCustomEmoji: Story = {
	args: { view: thread({ emoji: {} }) },
};

/** The reader has no Slack account of their own connected: read only, with a way to connect. */
export const NotConnected: Story = {
	args: { view: thread({ readerConnected: false }) },
};

export const NoPermalink: Story = {
	args: { view: thread({ permalink: null }) },
};

/** Real threads from the team's Slack, captured from conversations.replies and mapped by the server's own code. */
const real = (view: unknown) => ({
	args: { view: view as SlackThreadView, done: true },
});

export const RealOnCallPaging: Story = real(onCallPaging);
export const RealPrButtonDiscussion: Story = real(prButtonDiscussion);
export const RealSupersetAgentTicket: Story = real(supersetAgentTicket);
export const RealGitHubInBugs: Story = real(githubInBugs);
export const RealAppsInTestAgents: Story = real(appsInTestAgents);
