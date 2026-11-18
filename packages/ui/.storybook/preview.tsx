import { I18nProvider } from "@lingui/react";
import type { Preview } from "@storybook/react-vite";
import { i18n, initI18n } from "@superset/i18n";
import "./storybook.css";

initI18n("en");

const preview: Preview = {
	globalTypes: {
		theme: {
			description: "Color theme",
			toolbar: {
				title: "Theme",
				icon: "mirror",
				items: ["dark", "light"],
				dynamicTitle: true,
			},
		},
		shell: {
			description: "Settings shell whose content width a page story uses",
			toolbar: {
				title: "Shell",
				icon: "browser",
				items: ["web", "desktop"],
				dynamicTitle: true,
			},
		},
	},
	initialGlobals: {
		theme: "dark",
		shell: "web",
	},
	decorators: [
		(Story, context) => {
			const isDark = context.globals.theme !== "light";
			document.documentElement.classList.toggle("dark", isDark);
			return (
				<I18nProvider i18n={i18n}>
					<Story />
				</I18nProvider>
			);
		},
	],
	parameters: {
		layout: "fullscreen",
		backgrounds: { disable: true },
	},
};

export default preview;
