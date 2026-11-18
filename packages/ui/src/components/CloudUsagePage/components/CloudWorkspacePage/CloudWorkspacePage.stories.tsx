import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuArrowUpRight } from "react-icons/lu";
import { Button } from "../../../ui/button";
import {
	allowanceFixtures,
	boots,
	pagesQuery,
	periods,
	query,
	rowOf,
	StoryLink,
	unavailableFixtures,
	usageFixtures,
	withSettingsShell,
	workspaceRefs,
} from "../../fixtures";
import type { CloudUsage, WorkspaceRef } from "../../types";
import { CloudWorkspacePage } from "./CloudWorkspacePage";

const list = periods({
	allowance: allowanceFixtures.freeCredits,
	unavailable: unavailableFixtures.none,
});
const one = (ref: WorkspaceRef) =>
	query({ ...usageFixtures.empty, items: [{ ...rowOf(ref), ref }] });

const meta = {
	title: "Cloud usage/Workspace",
	component: CloudWorkspacePage,
	decorators: [withSettingsShell],
	args: {
		Link: StoryLink,
		periods: query(list),
		period: list.items[0],
		workspace: one(workspaceRefs.asleep),
		boots: pagesQuery([boots(workspaceRefs.asleep)]),
		openWorkspace: () => (
			<Button variant="outline" size="sm">
				<Trans>Open workspace</Trans>
				<LuArrowUpRight />
			</Button>
		),
	},
} satisfies Meta<typeof CloudWorkspacePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** As on desktop, with "Open workspace"; the web has no workspace page to open. */
export const Desktop: Story = {};
export const Web: Story = { args: { openWorkspace: undefined } };
export const Failed: Story = {
	args: {
		workspace: one(workspaceRefs.failed),
		boots: pagesQuery([boots(workspaceRefs.failed, true)]),
	},
};
export const Running: Story = {
	args: {
		workspace: one({ ...workspaceRefs.asleep, status: "awake" }),
		boots: pagesQuery([boots({ ...workspaceRefs.asleep, status: "awake" })]),
	},
};
export const NoUsage: Story = {
	args: { workspace: query(usageFixtures.empty), boots: pagesQuery([]) },
};
export const LongNames: Story = {
	args: {
		workspace: one(workspaceRefs.long),
		boots: pagesQuery([boots(workspaceRefs.long)]),
	},
};
export const Loading: Story = {
	args: { workspace: query<CloudUsage>(undefined) },
};
