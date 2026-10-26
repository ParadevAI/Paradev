import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { formatNumber, formatRelativeTime } from "@superset/i18n/format";
import { getPresetIcon } from "@superset/ui/icons/preset-icons";
import {
	type CSSProperties,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { ProviderIcon } from "renderer/components/ProviderIcon";
import {
	creditBalanceReading,
	formatCreditBalance,
} from "shared/usage-credits";
import { quotaWindowReading } from "shared/usage-reading";
import {
	liveResetCredits,
	resetExpiryUrgency,
} from "shared/usage-resets/model";
import {
	displayWindows,
	edgeAccounts,
	type edgeHandleLayout,
	exhaustedQuota,
	isFresh,
	metricValue,
	PROVIDER_NAMES,
	quotaColor,
	type WidgetSnapshot,
	widgetAccountInitials,
	widgetAccountLabel,
	widgetUsageReading,
} from "shared/usage-widget/model";
import { resetCountdown } from "./reset-countdown";

export function EdgeHandle({
	state,
	layout,
}: {
	state: WidgetSnapshot;
	layout: ReturnType<typeof edgeHandleLayout>;
}) {
	const { t, i18n } = useLingui();
	const accounts = edgeAccounts(state.accounts, state.preferences);
	const list = useRef<HTMLDivElement>(null);
	const [overflow, setOverflow] = useState({ above: false, below: false });
	const measure = useCallback(() => {
		const node = list.current;
		if (!node) return;
		setOverflow({
			above: node.scrollTop > 1,
			below: node.scrollTop + node.clientHeight < node.scrollHeight - 1,
		});
	}, []);
	useLayoutEffect(() => {
		const node = list.current;
		if (!node) return;
		if (!accounts.length) node.scrollTop = 0;
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		measure();
		return () => observer.disconnect();
	}, [accounts.length, measure]);
	const hover = (id: string, button: HTMLButtonElement) => {
		const bounds = button.getBoundingClientRect();
		window.UsageWidget.hover(id, bounds.top + bounds.height / 2);
	};
	return (
		<div className="usage-edge">
			<div
				className="usage-edge-list"
				style={{
					gridTemplateColumns: `repeat(${layout.columns}, 46px)`,
					gridTemplateRows: layout.rows
						? `repeat(${layout.rows}, ${layout.itemHeight}px)`
						: undefined,
				}}
				ref={list}
				data-above={overflow.above}
				data-below={overflow.below}
				onScroll={() => {
					window.UsageWidget.hover(null);
					measure();
				}}
			>
				{accounts.map((account) => {
					const now = Date.now();
					const reading = widgetUsageReading(account, state.offline, now);
					const peers = state.accounts.filter(
						(a) => a.provider === account.provider,
					);
					const index = peers.findIndex((a) => a.id === account.id);
					const label = widgetAccountLabel(
						account,
						index,
						state.preferences.hideEmails,
					);
					const windows = displayWindows(reading.windows).slice(0, 2);
					const quotas = (windows.length ? windows : [undefined]).map(
						(quota, position) => {
							const windowReading = quotaWindowReading(reading, quota, now);
							const visible = quota && windowReading !== "unavailable";
							const current = windowReading === "current";
							return {
								id: quota?.id ?? "unavailable",
								label: quota?.label ?? t`Usage unavailable`,
								value: visible
									? metricValue(quota, state.preferences.metric)
									: null,
								color: visible ? quotaColor(quota.usedPercent) : null,
								low: current && quota && quota.usedPercent >= 90,
								stale: visible && !current,
								awaitingRefresh: windowReading === "awaiting_refresh",
								d:
									windows.length <= 1
										? "M18 2a16 16 0 1 1 0 32a16 16 0 1 1 0-32"
										: position === 0
											? "M2 18a16 16 0 0 1 32 0"
											: "M34 20a16 16 0 0 1-32 0",
							};
						},
					);
					const resets = isFresh(account, state.offline, now)
						? liveResetCredits(account.resetCredits)
						: null;
					const count = resets?.count ?? 0;
					const credit = creditBalanceReading(account, state.offline, now);
					const creditText = credit
						? `${credit.fresh ? "" : "~"}${formatCreditBalance(credit, i18n.locale, true)}`
						: null;
					const exhausted = exhaustedQuota(account, state.offline, now);
					const countdown = exhausted?.resetsAt
						? resetCountdown(exhausted.resetsAt)
						: null;
					const exhaustionLabel = exhausted
						? countdown
							? t({ message: `Quota exhausted. Resets in ${countdown}` })
							: t({ message: "Quota exhausted. Reset time unavailable" })
						: "";
					const stale = quotas.some((q) => q.stale);
					const relativeTime = reading.checkedAt
						? formatRelativeTime(reading.checkedAt)
						: "";
					const timestamp = reading.checkedAt
						? stale || reading.freshness !== "fresh"
							? t({ message: `Last checked ${relativeTime} · not live` })
							: t({ message: `Last checked ${relativeTime}` })
						: "";
					const description = `${PROVIDER_NAMES[account.provider]} · ${label}. ${quotas.map((q) => `${q.label}: ${q.value === null ? t`Usage unavailable` : `${q.stale ? "~" : ""}${formatNumber(q.value)}%`}${q.awaitingRefresh ? ` · ${t`Awaiting refresh`}` : ""}`).join(" · ")} ${state.preferences.metric === "remaining" ? t`Remaining` : t`Used`}${timestamp ? ` · ${timestamp}` : ""}`;
					return (
						<button
							key={account.id}
							type="button"
							className="usage-edge-item"
							data-exhausted={Boolean(exhausted)}
							data-stale={stale}
							title={`${description}${creditText ? ` · ${t({ message: "Credit balance" })}: ${creditText}` : ""}${exhaustionLabel ? ` · ${exhaustionLabel}` : ""}`}
							aria-label={`${description}${creditText ? ` · ${t({ message: "Credit balance" })}: ${creditText}` : ""}${exhaustionLabel ? ` · ${exhaustionLabel}` : ""}${resets?.count ? ` · ${t({ message: plural(count, { one: "# reset available", other: "# resets available" }) })}` : ""}`}
							onMouseEnter={(event) => hover(account.id, event.currentTarget)}
							onMouseLeave={() => window.UsageWidget.hover(null)}
							onFocus={(event) => hover(account.id, event.currentTarget)}
							onBlur={() => window.UsageWidget.hover(null)}
							onClick={() => void window.UsageWidget.action("expand")}
						>
							<span className="usage-edge-orbit" aria-hidden="true">
								<svg viewBox="0 0 36 36" aria-hidden="true">
									{quotas.map((q) => (
										<g
											key={q.id}
											style={
												q.color
													? ({ "--quota-color": q.color } as CSSProperties)
													: undefined
											}
											className={`usage-edge-arc ${q.low ? "usage-edge-critical" : ""} ${q.stale ? "usage-edge-stale" : ""}`}
										>
											<path
												d={q.d}
												pathLength={100}
												className={
													q.value === null
														? "usage-edge-unknown"
														: "usage-edge-track"
												}
											/>
											{q.value !== null && q.value > 0 && (
												<path
													d={q.d}
													pathLength={100}
													className="usage-edge-fill"
													strokeDasharray={`${q.value} 100`}
												/>
											)}
										</g>
									))}
								</svg>
								<ProviderIcon
									provider={account.provider}
									color={account.color}
									dark
									className="usage-edge-provider-icon"
								/>
								{stale && <span className="usage-edge-stale-mark">~</span>}
								{resets && resets.count > 0 && (
									<span
										className="usage-edge-reset"
										data-urgency={resetExpiryUrgency(resets.nextExpiry)}
										data-multiple={resets.count > 1}
										aria-hidden="true"
									>
										{resets.count > 1
											? `${resets.count > 99 ? `${formatNumber(99)}+` : formatNumber(resets.count)}×`
											: "↻"}
									</span>
								)}
								<span className="usage-edge-initials">
									{widgetAccountInitials(
										account,
										state.accounts,
										state.preferences.hideEmails,
									)}
								</span>
							</span>
							{(exhausted || creditText) && (
								<span className="usage-edge-countdown" aria-hidden="true">
									{credit && credit.amount > 0
										? creditText
										: exhausted
											? (countdown ?? "↻ —")
											: creditText}
								</span>
							)}
						</button>
					);
				})}
			</div>
			<button
				type="button"
				className="usage-edge-more"
				aria-label={`${t`Open usage`} · ${formatNumber(state.accounts.length)}`}
				onClick={() => void window.UsageWidget.action("expand")}
			>
				<img src={getPresetIcon("superset", true)} alt="" className="size-4" />
			</button>
		</div>
	);
}
