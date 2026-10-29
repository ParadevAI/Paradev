import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { ApplicationsArt } from "./components/ApplicationsArt";
import { DmgWindowArt } from "./components/DmgWindowArt";
import { DownloadsArt } from "./components/DownloadsArt";

interface Step {
	id: string;
	art: ReactNode;
	caption: ReactNode;
}

export function InstallSteps() {
	const steps: Step[] = [
		{
			id: "open-download",
			art: <DownloadsArt />,
			caption: (
				<Trans>
					Open the disk image from your <strong>Downloads</strong> folder
				</Trans>
			),
		},
		{
			id: "drag-to-applications",
			art: <DmgWindowArt />,
			caption: (
				<Trans>
					Drag <strong>Paradev</strong> into your <strong>Applications</strong>{" "}
					folder
				</Trans>
			),
		},
		{
			id: "open-app",
			art: <ApplicationsArt />,
			caption: (
				<Trans>
					Open <strong>Paradev</strong> from your <strong>Applications</strong>{" "}
					folder
				</Trans>
			),
		},
	];

	return (
		<section className="mx-auto max-w-4xl text-center">
			<h2 className="font-light text-2xl text-foreground tracking-tight sm:text-3xl">
				<Trans>How to install Paradev</Trans>
			</h2>
			<ol className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-5">
				{steps.map((step, index) => (
					<li key={step.id} className="flex flex-col items-center">
						<span className="mb-4 flex size-7 items-center justify-center rounded-full bg-muted font-mono text-muted-foreground text-xs">
							{index + 1}
						</span>
						<div
							aria-hidden="true"
							className="aspect-[16/11] w-full overflow-hidden rounded-xl border border-border"
						>
							{step.art}
						</div>
						<p className="mt-4 max-w-[16rem] text-muted-foreground text-sm leading-relaxed [&_strong]:font-medium [&_strong]:text-foreground">
							{step.caption}
						</p>
					</li>
				))}
			</ol>
		</section>
	);
}
