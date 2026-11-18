import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	allowanceFixtures,
	PEOPLE,
	pagesQuery,
	periods,
	query,
	rowsFixtures,
	StoryLink,
	unavailableFixtures,
	usageFixtures,
	withSettingsShell,
	workspacePages,
} from "../../fixtures";
import { CloudWorkspacesPage } from "./CloudWorkspacesPage";

const list = periods({
	allowance: allowanceFixtures.freeCredits,
	unavailable: unavailableFixtures.none,
});

const meta = {
	title: "Cloud usage/Workspaces",
	component: CloudWorkspacesPage,
	decorators: [withSettingsShell],
	args: {
		Link: StoryLink,
		navigate: () => undefined,
		isAdmin: true,
		periods: query(list),
		period: list.items[0],
		workspaces: pagesQuery(workspacePages()),
		filters: {},
		byPerson: query(usageFixtures.byPerson),
	},
} satisfies Meta<typeof CloudWorkspacesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Owner: Story = {};
export const Filtered: Story = {
	args: {
		filters: { status: "asleep", sort: "name" },
		workspaces: pagesQuery(workspacePages(rowsFixtures.asleepByName)),
	},
};
export const Person: Story = {
	args: {
		filters: { user: PEOPLE[0]?.id },
		workspaces: pagesQuery(workspacePages(rowsFixtures.priya)),
	},
};
export const Search: Story = {
	args: {
		filters: { q: "sync" },
		workspaces: pagesQuery(workspacePages(rowsFixtures.sync)),
	},
};
export const Page2: Story = {
	args: { filters: { page: 2 }, workspaces: pagesQuery(workspacePages()) },
};
export const NoMatch: Story = {
	args: {
		filters: { q: "nothing" },
		workspaces: pagesQuery(workspacePages([])),
	},
};
export const Member: Story = {
	args: {
		isAdmin: false,
		workspaces: pagesQuery(workspacePages(rowsFixtures.member)),
	},
};
export const LongNames: Story = {
	args: { workspaces: pagesQuery(workspacePages(rowsFixtures.long)) },
};
export const Loading: Story = { args: { workspaces: pagesQuery(undefined) } };
export const LoadError: Story = {
	args: { workspaces: pagesQuery(undefined, true) },
};
