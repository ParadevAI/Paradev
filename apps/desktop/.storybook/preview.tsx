import { I18nProvider } from "@lingui/react";
import type { Preview } from "@storybook/react-vite";
import { i18n, initI18n } from "@superset/i18n";
import { TooltipProvider } from "@superset/ui/tooltip";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import "./storybook.css";

initI18n("en");

const router = createRouter({
	routeTree: createRootRoute(),
	history: createMemoryHistory(),
});

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
	},
	initialGlobals: {
		theme: "dark",
	},
	decorators: [
		(Story, context) => {
			const isDark = context.globals.theme !== "light";
			document.documentElement.classList.toggle("dark", isDark);
			document.documentElement.classList.toggle("light", !isDark);
			return (
				<I18nProvider i18n={i18n}>
					<RouterContextProvider router={router}>
						<TooltipProvider>
							<div className="min-h-screen bg-background p-6 text-foreground">
								<Story />
							</div>
						</TooltipProvider>
					</RouterContextProvider>
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
