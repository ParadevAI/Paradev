"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaApple, FaGithub, FaGooglePlay } from "react-icons/fa";
import { BlackFridayActions } from "@/app/[lang]/components/BlackFridayActions";
import { DownloadButton } from "@/app/[lang]/components/DownloadButton";
import { EdgeGlare } from "@/app/[lang]/components/EdgeGlare";
import { BoidsBackground } from "@/app/[lang]/components/HeroSection/components/BoidsBackground";
import { ProductDemo } from "@/app/[lang]/components/HeroSection/components/ProductDemo";
import { RiseHeadline } from "@/app/[lang]/components/HeroSection/components/RiseHeadline";
import { PromoCode } from "@/app/[lang]/components/PromoCode";
import { WaitlistModal } from "@/app/[lang]/components/WaitlistModal";
import { track } from "@/lib/analytics";

export function LandingHero({
	lead,
	emphasis,
	subheadline,
	promoCode,
	badge,
}: {
	lead: string;
	emphasis: string;
	subheadline?: string;
	promoCode?: string;
	badge?: { label: string; href: string };
}) {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
	const [deviceStore, setDeviceStore] = useState<
		"app_store" | "google_play" | null
	>(null);

	useEffect(() => {
		const isIOS =
			/iphone|ipad|ipod/i.test(navigator.userAgent) ||
			(/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
		if (isIOS) setDeviceStore("app_store");
		else if (/android/i.test(navigator.userAgent))
			setDeviceStore("google_play");
	}, []);
	const { t, i18n } = useLingui();

	return (
		<div>
			<div className="relative flex flex-col items-center pt-24 sm:pt-32 lg:pt-40 pb-16 sm:pb-24 overflow-hidden">
				<BoidsBackground />
				<div className="relative w-full max-w-7xl mx-auto px-6 sm:px-8">
					<div className="flex flex-col items-center text-center">
						<Link
							href={badge?.href ?? "/blog/superset-is-now-paradev"}
							className="group relative mb-6 sm:mb-8 inline-flex max-w-full items-center gap-2 rounded-[2px] border border-border bg-background/80 px-3 py-1.5 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/[0.2]"
						>
							<span>
								{badge?.label ?? (
									<Trans>
										Superset is now Paradev. Also, we raised an $11.5M seed
									</Trans>
								)}
							</span>
							{!badge && (
								<span
									aria-hidden="true"
									className="shrink-0 transition-transform group-hover:translate-x-0.5"
								>
									→
								</span>
							)}
							<EdgeGlare className="-inset-px rounded-[inherit]" />
						</Link>
						<div className="space-y-4 sm:space-y-6">
							<h1 className="text-[min(2.25rem,8.6vw)] sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight leading-[1.1] [word-spacing:0.15em] whitespace-pre-line text-foreground relative max-w-6xl mx-auto">
								<RiseHeadline lead={lead} emphasis={emphasis} />
							</h1>
							<p
								id="hero-subheadline"
								className="text-base sm:text-xl font-light text-muted-foreground max-w-4xl mx-auto"
							>
								{subheadline ?? (
									<Trans>
										The open-source workspace for Claude Code, Codex, and any
										agent. Locally or in the cloud.
									</Trans>
								)}
							</p>
							{promoCode && (
								<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2.5 text-xs sm:text-sm text-muted-foreground">
									<span className="justify-self-end">Use code</span>
									<PromoCode
										code={promoCode}
										source="black_friday_hero"
										size="xs"
									/>
									<span className="justify-self-start">at checkout</span>
								</div>
							)}
						</div>

						{promoCode ? (
							<BlackFridayActions
								source="black_friday_hero"
								className="mt-6 sm:mt-8"
							/>
						) : (
							<div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-6 sm:mt-8">
								<DownloadButton
									source="hero"
									onJoinWaitlist={() => setIsWaitlistOpen(true)}
								/>
								<Link
									href={
										deviceStore === "app_store"
											? COMPANY.APP_STORE_URL
											: deviceStore === "google_play"
												? COMPANY.PLAY_STORE_URL
												: i18n.locale === "en"
													? "/mobile"
													: `/${i18n.locale}/mobile`
									}
									onClick={() =>
										deviceStore
											? track("mobile_store_clicked", {
													store: deviceStore,
													source: "hero",
												})
											: track("mobile_page_clicked", { source: "hero" })
									}
									aria-label={t({
										message: "Paradev for iPhone, iPad, and Android",
									})}
									className="flex size-11 shrink-0 items-center justify-center border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:size-12"
								>
									{deviceStore === "google_play" ? (
										<FaGooglePlay aria-hidden="true" className="size-4" />
									) : (
										<FaApple aria-hidden="true" className="size-5" />
									)}
								</Link>
								<button
									type="button"
									className="flex size-11 shrink-0 items-center justify-center border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:size-12"
									onClick={() => {
										track("github_clicked", { source: "hero" });
										window.open(
											COMPANY.GITHUB_URL,
											"_blank",
											"noopener,noreferrer",
										);
									}}
									aria-label={t({
										message: "View on GitHub",
									})}
								>
									<FaGithub aria-hidden="true" className="size-5" />
								</button>
							</div>
						)}
					</div>

					<div className="relative w-full mt-20 sm:mt-32 lg:mt-40">
						<ProductDemo />
					</div>
				</div>
			</div>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</div>
	);
}
