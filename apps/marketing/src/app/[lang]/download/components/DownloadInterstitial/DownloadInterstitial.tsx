"use client";

import { Trans } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import { WaitlistForm } from "@/app/[lang]/components/WaitlistForm";
import {
	ArchSource,
	isMacPlatform,
	Platform,
	usePlatform,
} from "@/app/[lang]/hooks/useOS";
import { track } from "@/lib/analytics";
import { desktopUrlFor, shouldAutoDownload } from "../../utils/desktopUrlFor";
import { DesktopDownloadButton } from "../DesktopDownloadButton";
import { DockShowcase } from "../DockShowcase";
import { DownloadFallback } from "../DownloadFallback";
import { DownloadLinkForm } from "../DownloadLinkForm";
import { InstallSteps } from "../InstallSteps";

const AUTO_DOWNLOAD_DELAY_MS = 600;

// Platform identifiers, not prose — they read the same in every locale
const PLATFORM_LABELS: Record<Platform, string> = {
	[Platform.MacAppleSilicon]: "macOS · Apple Silicon",
	[Platform.MacIntel]: "macOS · Intel",
	[Platform.Windows]: "Windows",
	[Platform.Linux]: "Linux · x64",
	[Platform.Mobile]: "Mobile browser",
	[Platform.Unknown]: "macOS",
};

const HEADING_CLASS =
	"text-3xl font-medium tracking-tight text-foreground sm:text-4xl";

export function DownloadInterstitial() {
	const { platform, archSource } = usePlatform();
	const firedRef = useRef(false);

	// The browser told us nothing about the chip, so Apple Silicon was assumed
	// rather than detected. Say that instead of labelling the guess as a
	// detection, and give Intel Macs a one-click way out.
	const archUnconfirmed = archSource === ArchSource.Default;

	// A phone can't run the app, so mobile visitors get a link to open on their
	// desktop. Windows has no published build and falls through to the waitlist.
	const showEmailLink = platform === Platform.Mobile;
	const canAutoDownload = !showEmailLink && shouldAutoDownload(platform);
	const showWaitlist = platform === Platform.Windows;
	// An undetected platform gets the macOS build, so the macOS steps apply
	const showInstallSteps =
		isMacPlatform(platform) || platform === Platform.Unknown;

	useEffect(() => {
		if (firedRef.current) return;
		if (!canAutoDownload) return;

		const url = desktopUrlFor(platform);

		// Latched in the callback, not here: if `platform` resolved again before
		// the timer fired, latching early would strand the pending redirect on
		// the stale URL. Cleanup cancels it so the newest platform wins.
		const timer = window.setTimeout(() => {
			firedRef.current = true;
			track("download_started", { platform, archSource, trigger: "auto" });
			window.location.href = url;
		}, AUTO_DOWNLOAD_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, [canAutoDownload, platform, archSource]);

	return (
		<>
			<section className="grid items-center gap-8 pb-12 sm:pb-16 lg:grid-cols-2 lg:gap-12">
				<DockShowcase />
				<div>
					<div className="mb-6 inline-flex w-max items-center gap-2 whitespace-nowrap rounded-[2px] border border-border bg-background/80 px-3 py-1.5 font-mono text-muted-foreground text-xs">
						<span className="shrink-0 text-brand">●</span>
						<span>
							{archUnconfirmed
								? PLATFORM_LABELS[Platform.Unknown]
								: PLATFORM_LABELS[platform]}
						</span>
					</div>

					{showEmailLink ? (
						<div className="max-w-2xl">
							<h1 className={HEADING_CLASS}>
								<Trans>Get Paradev on your Mac</Trans>
							</h1>
							<p className="mt-3 text-muted-foreground sm:text-lg">
								<Trans>
									Paradev is a desktop app. Enter your email and we&apos;ll send
									you a download link to open on your Mac.
								</Trans>
							</p>
							<div className="mt-6">
								<DownloadLinkForm />
							</div>
						</div>
					) : showWaitlist ? (
						<div className="max-w-2xl">
							<h1 className={HEADING_CLASS}>
								<Trans>Paradev isn't on Windows yet</Trans>
							</h1>
							<p className="mt-3 text-muted-foreground sm:text-lg">
								<Trans>
									The desktop app runs on macOS and Linux today. Drop your email
									and we'll let you know the moment the Windows build ships.
								</Trans>
							</p>
							<div className="mt-6 max-w-sm">
								<WaitlistForm />
							</div>
						</div>
					) : (
						<div className="max-w-2xl">
							<h1 className={HEADING_CLASS}>
								<Trans>You're about to get Paradev</Trans>
							</h1>
							{canAutoDownload ? (
								<p className="mt-3 text-muted-foreground sm:text-lg">
									<Trans>Your download starts automatically.</Trans>
								</p>
							) : (
								<div className="mt-6">
									<DesktopDownloadButton />
								</div>
							)}
						</div>
					)}
				</div>
			</section>
			{showInstallSteps || canAutoDownload ? (
				<div className="space-y-10 pb-8">
					{showInstallSteps ? <InstallSteps /> : null}
					{canAutoDownload ? (
						<DownloadFallback platform={platform} archSource={archSource} />
					) : null}
				</div>
			) : null}
		</>
	);
}
