import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Calendar } from "./calendar";

const meta = {
	title: "Calendar",
	component: Calendar,
	args: {
		mode: "range",
		numberOfMonths: 2,
		defaultMonth: new Date(2026, 9, 1),
		selected: { from: new Date(2026, 9, 5), to: new Date(2026, 9, 21) },
	},
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

const inLocale = (locale: string): Story["decorators"] => [
	(Story) => (
		<I18nProvider i18n={setupI18n({ locale, messages: { [locale]: {} } })}>
			<Story />
		</I18nProvider>
	),
];

export const English: Story = {};

export const German: Story = { decorators: inLocale("de") };

export const Japanese: Story = { decorators: inLocale("ja") };
