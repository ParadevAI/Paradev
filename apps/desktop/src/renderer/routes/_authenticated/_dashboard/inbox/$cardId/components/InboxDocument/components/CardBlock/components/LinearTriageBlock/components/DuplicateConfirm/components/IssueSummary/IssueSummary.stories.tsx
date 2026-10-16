import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	flickerIssue,
	members,
	triageIssue,
} from "../../../../../linearFixtures";
import { IssueSummary } from "./IssueSummary";

const meta = {
	component: IssueSummary,
	args: { issue: flickerIssue, members },
} satisfies Meta<typeof IssueSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Assigned: Story = {};
export const Unassigned: Story = { args: { issue: triageIssue } };
