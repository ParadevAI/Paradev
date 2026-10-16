import type { Meta, StoryObj } from "@storybook/react-vite";
import { findTimeView, slackFindTimeView } from "../../../calendarFixtures";
import { AskSummary } from "./AskSummary";

const meta = {
	component: AskSummary,
	args: { ask: findTimeView.ask },
} satisfies Meta<typeof AskSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gmail: Story = {};

export const Slack: Story = { args: { ask: slackFindTimeView.ask } };

export const NoLink: Story = {
	args: { ask: { ...findTimeView.ask, url: null } },
};
