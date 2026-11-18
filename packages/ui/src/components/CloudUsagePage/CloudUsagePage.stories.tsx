import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudUsagePage } from "./CloudUsagePage";
import {
	allowanceFixtures,
	periods,
	query,
	StoryLink,
	unavailableFixtures,
	usageFixtures,
	withoutRate,
	withSettingsShell,
} from "./fixtures";
import type { CloudUsage } from "./types";

const current = (
	allowance: keyof typeof allowanceFixtures,
	unavailable: keyof typeof unavailableFixtures = "none",
) =>
	periods({
		allowance: allowanceFixtures[allowance],
		unavailable: unavailableFixtures[unavailable],
	});

const base = current("freeCredits");

const meta = {
	title: "Cloud usage/Overview",
	component: CloudUsagePage,
	decorators: [withSettingsShell],
	args: {
		Link: StoryLink,
		isAdmin: true,
		periods: query(base),
		period: base.items[0],
		byDay: query(usageFixtures.byDay),
		byPerson: query(usageFixtures.byPerson),
		workspaces: query(usageFixtures.top),
	},
} satisfies Meta<typeof CloudUsagePage>;

export default meta;
type Story = StoryObj<typeof meta>;

const withAllowance = (
	allowance: keyof typeof allowanceFixtures,
	unavailable?: keyof typeof unavailableFixtures,
): Story["args"] => {
	const list = current(allowance, unavailable);
	return { periods: query(list), period: list.items[0] };
};

export const Owner: Story = {};
export const Trial: Story = { args: withAllowance("seatsOnly") };
export const Over: Story = { args: withAllowance("over") };
export const Prepaid: Story = { args: withAllowance("bought") };
export const LimitReached: Story = { args: withAllowance("limitReached") };
export const PercentCap: Story = {
	args: withAllowance("percentCap", "percentCap"),
};
export const NotRead: Story = { args: withAllowance("notRead", "notRead") };
export const NoRate: Story = {
	args: {
		...withAllowance("noRate"),
		byDay: query(withoutRate(usageFixtures.byDay)),
		byPerson: query(withoutRate(usageFixtures.byPerson)),
		workspaces: query(withoutRate(usageFixtures.top)),
	},
};
export const PastPeriod: Story = {
	args: { period: base.items[1] },
};
export const Empty: Story = {
	args: {
		period: base.items[5],
		byDay: query(usageFixtures.empty),
		byPerson: query(usageFixtures.empty),
		workspaces: query(usageFixtures.empty),
	},
};
export const NoPeriods: Story = {
	args: {
		periods: query({ items: [], nextCursor: null }),
		period: undefined,
		byDay: query(withoutRate(usageFixtures.byDay)),
		byPerson: query(withoutRate(usageFixtures.byPerson)),
		workspaces: query(withoutRate(usageFixtures.top)),
	},
};
export const Loading: Story = { args: { byDay: query<CloudUsage>(undefined) } };
export const LoadError: Story = {
	args: { byDay: query<CloudUsage>(undefined, true) },
};
export const Member: Story = {
	args: {
		isAdmin: false,
		...withAllowance("freeCredits"),
		byDay: query(usageFixtures.memberByDay),
		workspaces: query(usageFixtures.memberTop),
	},
};
export const LongNames: Story = {
	args: {
		byDay: query(usageFixtures.longByDay),
		byPerson: query(usageFixtures.longByPerson),
		workspaces: query(usageFixtures.longTop),
	},
};
