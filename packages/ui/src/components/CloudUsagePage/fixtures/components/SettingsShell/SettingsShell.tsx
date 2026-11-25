import type { Decorator } from "@storybook/react-vite";
import type { ReactNode } from "react";

type Shell = "web" | "desktop";

/** The content box each app's Settings gives these pages (sidebar, padding, max width), so a story folds at the app's content width. */
export function SettingsShell({
	shell,
	children,
}: {
	shell: Shell;
	children: ReactNode;
}) {
	if (shell === "desktop") {
		return (
			<div className="flex min-h-screen bg-background">
				<div className="w-56 shrink-0 border-r border-border bg-sidebar dark:bg-muted/35" />
				<div className="min-w-0 flex-1">
					<div className="h-12" />
					<div className="mx-auto max-w-4xl p-6">{children}</div>
				</div>
			</div>
		);
	}
	return (
		<div className="flex min-h-screen bg-background">
			<div className="hidden w-56 shrink-0 border-r md:block" />
			<div className="min-w-0 flex-1">
				<div className="mx-auto w-full max-w-5xl px-6 py-8">{children}</div>
			</div>
		</div>
	);
}

/** Story decorator: the shell named by the `shell` toolbar global (web by default). */
export const withSettingsShell: Decorator = (Story, context) => (
	<SettingsShell
		shell={context.globals.shell === "desktop" ? "desktop" : "web"}
	>
		<Story />
	</SettingsShell>
);
