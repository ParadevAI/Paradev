import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudUsagePage } from "./CloudUsagePage";
import {
	noPeriodsArgs,
	overviewArgs,
	query,
	STORY_TODAY,
	StoryLink,
	withSettingsShell,
} from "./fixtures";
import type { CloudUsage } from "./types";

const meta = {
	title: "Cloud usage/Overview",
	component: CloudUsagePage,
	decorators: [withSettingsShell],
	args: {
		Link: StoryLink,
		isAdmin: true,
		today: STORY_TODAY,
		...overviewArgs("northwind"),
	},
} satisfies Meta<typeof CloudUsagePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Northwind Labs, as in the design: seats, a used-up free credit and extra usage under its cap. */
export const Owner: Story = {};
/** Birchwood Health, as in the design: on a trial, seats only, under its allowance. */
export const Trial: Story = { args: overviewArgs("trial") };
/** Acme Robotics, as in the design: a bought pack not drawn yet. */
export const Prepaid: Story = { args: overviewArgs("prepaid") };
export const LimitReached: Story = { args: overviewArgs("limitReached") };
export const PercentCap: Story = { args: overviewArgs("percentCap") };
export const NotRead: Story = { args: overviewArgs("notRead") };
export const Unbilled: Story = { args: overviewArgs("unbilled") };
export const PastPeriod: Story = {
	args: overviewArgs("northwind", { back: 1 }),
};
export const Empty: Story = { args: overviewArgs("northwind", { back: 5 }) };
export const NoPeriods: Story = { args: noPeriodsArgs() };
export const Loading: Story = { args: { byDay: query<CloudUsage>(undefined) } };
export const LoadError: Story = {
	args: { byDay: query<CloudUsage>(undefined, true) },
};
export const Member: Story = {
	args: { isAdmin: false, ...overviewArgs("northwind", { member: true }) },
};
export const LongNames: Story = {
	args: overviewArgs("northwind", { long: true }),
};
