import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuArrowUpRight } from "react-icons/lu";
import { Button } from "../../../ui/button";
import {
	emptyUsage,
	pagesQuery,
	query,
	StoryLink,
	withSettingsShell,
	workspaceArgs,
} from "../../fixtures";
import type { CloudBoots, CloudUsage } from "../../types";
import { CloudWorkspacePage } from "./CloudWorkspacePage";

const openWorkspace = () => (
	<Button variant="outline" size="sm">
		<Trans>Open workspace</Trans>
		<LuArrowUpRight />
	</Button>
);

/** Stories render as on the web, with no "Open workspace", unless named for desktop. */
const meta = {
	title: "Cloud usage/Workspace",
	component: CloudWorkspacePage,
	decorators: [withSettingsShell],
	args: { Link: StoryLink, ...workspaceArgs("asleep") },
} satisfies Meta<typeof CloudWorkspacePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = { args: { openWorkspace } };
export const Web: Story = {};
export const Failed: Story = { args: workspaceArgs("failed") };
export const Running: Story = { args: workspaceArgs("awake") };
/** No usage in the period: the name comes from the workspace's usage over all time. */
export const NoUsage: Story = {
	args: {
		workspace: query(emptyUsage),
		boots: pagesQuery<CloudBoots>([]),
	},
};
export const LongNamesDesktop: Story = {
	args: { ...workspaceArgs("long"), openWorkspace },
};
export const Loading: Story = {
	args: {
		workspace: query<CloudUsage>(undefined),
		allTime: query<CloudUsage>(undefined),
		boots: pagesQuery<CloudBoots>(undefined),
	},
};
