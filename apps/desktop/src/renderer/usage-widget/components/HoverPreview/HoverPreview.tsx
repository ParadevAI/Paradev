import { Plural, Trans } from "@lingui/react/macro";
import { formatNumber, formatRelativeTime } from "@superset/i18n/format";
import { ProviderIcon } from "renderer/components/ProviderIcon";
import { UsageCreditBalance } from "renderer/components/UsageCreditBalance";
import { quotaWindowReading } from "shared/usage-reading";
import {
	liveResetCredits,
	resetExpiryUrgency,
} from "shared/usage-resets/model";
import {
	allUsageWindowsCurrent,
	displayWindows,
	isFresh,
	metricValue,
	PROVIDER_NAMES,
	type WidgetSnapshot,
	widgetAccountLabel,
	widgetUsageReading,
} from "shared/usage-widget/model";

export function HoverPreview({
	state,
	accountId,
}: {
	state: WidgetSnapshot;
	accountId: string;
}) {
	const account = state.accounts.find((a) => a.id === accountId);
	const provider = account?.provider ?? "claude";
	const accounts = state.accounts.filter((a) => a.provider === provider);
	const index = accounts.findIndex((a) => a.id === account?.id);
	const now = Date.now();
	const reading = account && widgetUsageReading(account, state.offline, now);
	const fresh = account && isFresh(account, state.offline, now);
	const allCurrent =
		account && allUsageWindowsCurrent(account, state.offline, now);
	const resets = fresh ? liveResetCredits(account?.resetCredits) : null;
	const needsSignIn =
		account &&
		(account.identityChanged ||
			account.status === "signed_out" ||
			account.status === "token_expired");
	return (
		<section
			className="usage-hover"
			aria-label={PROVIDER_NAMES[provider]}
			onMouseEnter={() => window.UsageWidget.hover(accountId)}
			onMouseLeave={() => window.UsageWidget.hover(null)}
		>
			<header className="usage-hover-header">
				<ProviderIcon
					provider={provider}
					color={account?.color}
					dark
					className="size-3.5"
				/>
				<span>{PROVIDER_NAMES[provider]}</span>
				<span className="usage-hover-count">
					{formatNumber(accounts.length)}
				</span>
				<span className="ml-auto text-[10px] text-muted-foreground">
					{state.preferences.metric === "remaining" ? (
						<Trans>Remaining</Trans>
					) : (
						<Trans>Used</Trans>
					)}
				</span>
			</header>
			{account ? (
				<>
					<div className="usage-hover-identity">
						<span className="truncate font-medium">
							{widgetAccountLabel(account, index, state.preferences.hideEmails)}
						</span>
						<span className="usage-plan">{account.plan}</span>
					</div>
					{resets && resets.count > 0 && (
						<p
							className="usage-reset-credit usage-reset-credit-preview"
							data-urgency={resetExpiryUrgency(resets.nextExpiry)}
						>
							<Plural
								value={resets.count}
								one="# reset available"
								other="# resets available"
							/>
							{resets.nextExpiry && (
								<span className="usage-reset-expiry">
									<Trans>
										Next expires {formatRelativeTime(resets.nextExpiry)}
									</Trans>
								</span>
							)}
						</p>
					)}
					<UsageCreditBalance account={account} offline={state.offline} />
					<div className="usage-quotas">
						{displayWindows(reading?.windows ?? [])
							.slice(0, 2)
							.map((quota) => {
								const windowReading = reading
									? quotaWindowReading(reading, quota, now)
									: "unavailable";
								const current = windowReading === "current";
								const value =
									quota && windowReading !== "unavailable"
										? metricValue(quota, state.preferences.metric)
										: null;
								return (
									<div
										key={quota.id}
										className={`usage-quota ${current && quota && quota.usedPercent >= 90 ? "usage-low" : ""}`}
										data-stale={value !== null && !current}
									>
										<div className="usage-quota-heading">
											<span className="usage-quota-label">{quota.label}</span>
											<span className="usage-quota-value">
												{value === null
													? "—"
													: `${current ? "" : "~"}${formatNumber(value)}%`}
											</span>
										</div>
										{value !== null && (
											<meter
												className="usage-track"
												aria-label={quota.label}
												min={0}
												max={100}
												value={value}
											/>
										)}
										<p className="usage-reset">
											{windowReading === "awaiting_refresh" ? (
												<Trans>Awaiting refresh</Trans>
											) : value !== null && quota?.resetsAt ? (
												<Trans>
													Resets {formatRelativeTime(new Date(quota.resetsAt))}
												</Trans>
											) : value === null ? (
												<Trans>Usage unavailable</Trans>
											) : null}
										</p>
									</div>
								);
							})}
						{!reading?.windows.length && (
							<p>
								<Trans>Usage unavailable</Trans>
							</p>
						)}
					</div>
					<p className="usage-hover-freshness">
						{reading?.checkedAt ? (
							allCurrent ? (
								<Trans>
									Last checked {formatRelativeTime(reading.checkedAt)}
								</Trans>
							) : (
								<Trans>
									Last checked {formatRelativeTime(reading.checkedAt)} · not
									live
								</Trans>
							)
						) : needsSignIn ? (
							<Trans>Sign in again</Trans>
						) : (
							<Trans>Usage unavailable</Trans>
						)}
					</p>
				</>
			) : (
				<p className="py-2 text-xs text-muted-foreground">
					<Trans>Choose an account</Trans>
				</p>
			)}
		</section>
	);
}
