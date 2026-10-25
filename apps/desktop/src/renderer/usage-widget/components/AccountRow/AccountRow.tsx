import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { formatNumber, formatRelativeTime } from "@superset/i18n/format";
import type { AccountColor } from "@superset/shared/account-colors";
import { AlertCircle, ChevronDown, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { AccountColorPicker } from "renderer/components/AccountColorPicker";
import { ProviderIcon } from "renderer/components/ProviderIcon";
import { UsageCreditBalance } from "renderer/components/UsageCreditBalance";
import { quotaWindowReading } from "shared/usage-reading";
import {
	liveResetCredits,
	resetExpiryUrgency,
} from "shared/usage-resets/model";
import {
	displayWindows,
	isCurrentWindow,
	isFresh,
	metricValue,
	type WidgetAccount,
	type WidgetSnapshot,
	widgetAccountLabel,
	widgetUsageReading,
} from "shared/usage-widget/model";
export function AccountRow({
	account,
	state,
	index,
	hidden,
	saving,
	onVisibilityChange,
	onColorChange,
	onColorOpenChange,
}: {
	account: WidgetAccount;
	state: WidgetSnapshot;
	index: number;
	hidden: boolean;
	saving: boolean;
	onVisibilityChange: (id: string, hidden: boolean) => Promise<void>;
	onColorChange?: (id: string, color: AccountColor | null) => Promise<void>;
	onColorOpenChange?: (open: boolean) => void;
}) {
	const { t } = useLingui();
	const [expanded, setExpanded] = useState(false);
	const now = Date.now();
	const reading = widgetUsageReading(account, state.offline, now);
	const fresh = isFresh(account, state.offline, now);
	const resets = fresh ? liveResetCredits(account.resetCredits) : null;
	const windows = reading.windows;
	const allCurrent =
		fresh &&
		windows.every((w) => quotaWindowReading(reading, w, now) === "current");
	const ordered = displayWindows(windows);
	const primary = ordered.slice(0, 2);
	const visible = expanded ? ordered : primary;
	const needsSignIn =
		account.identityChanged ||
		account.status === "signed_out" ||
		account.status === "token_expired";
	const label = widgetAccountLabel(
		account,
		index,
		state.preferences.hideEmails,
	);
	return (
		<article className="usage-account" data-hidden={hidden}>
			<div className="usage-account-heading">
				<ProviderIcon
					provider={account.provider}
					color={account.color}
					dark={state.surface === "edge" || state.dark}
					className="size-3.5"
				/>
				<span className="usage-account-name" title={label}>
					{label}
				</span>
				{account.isDefault && (
					<span className="usage-default">
						<Trans>Default</Trans>
					</span>
				)}
				<span className="usage-plan">{account.plan}</span>
				{onColorChange && (
					<AccountColorPicker
						accountLabel={label}
						color={account.color}
						dark={state.surface === "edge" || state.dark}
						saving={saving}
						onSave={(color) => onColorChange(account.id, color)}
						onOpenChange={onColorOpenChange}
					/>
				)}
				<button
					type="button"
					className="usage-visibility"
					aria-label={`${hidden ? t`Show account` : t`Hide account`} · ${label}`}
					title={hidden ? t`Show account` : t`Hide account`}
					disabled={saving}
					onClick={() => void onVisibilityChange(account.id, !hidden)}
				>
					{hidden ? <EyeOff size={12} /> : <Eye size={12} />}
					<span>{hidden ? t`Show` : t`Hide`}</span>
				</button>
			</div>
			{!state.preferences.hideEmails &&
				account.email &&
				account.label !== account.email && (
					<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
						{account.email}
					</p>
				)}
			{resets && resets.count > 0 && (
				<button
					type="button"
					className="usage-reset-credit"
					data-urgency={resetExpiryUrgency(resets.nextExpiry)}
					onClick={() => void window.UsageWidget.action("usage")}
				>
					<span>
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
					</span>
					<span aria-hidden="true">↗</span>
				</button>
			)}
			<UsageCreditBalance account={account} offline={state.offline} />
			<div className="usage-quotas">
				{visible.map((w) => (
					<div
						key={w.id}
						className={`usage-quota ${isCurrentWindow(account, w, state.offline, now) && w.usedPercent >= 90 ? "usage-low" : ""}`}
						data-stale={quotaWindowReading(reading, w, now) !== "current"}
					>
						<div className="usage-quota-heading">
							<span className="usage-quota-label">{w.label}</span>
							<span className="usage-quota-value">
								{quotaWindowReading(reading, w, now) !== "current" && "~"}
								{formatNumber(metricValue(w, state.preferences.metric))}%{" "}
								<span className="sr-only">
									{state.preferences.metric === "remaining" ? (
										<Trans>remaining</Trans>
									) : (
										<Trans>used</Trans>
									)}
								</span>
							</span>
						</div>
						<meter
							className="usage-track"
							aria-label={w.label}
							min={0}
							max={100}
							value={metricValue(w, state.preferences.metric)}
						/>
						{w.resetsAt && (
							<p className="usage-reset">
								{quotaWindowReading(reading, w, now) === "awaiting_refresh" ? (
									<Trans>Awaiting refresh</Trans>
								) : (
									<Trans>
										Resets {formatRelativeTime(new Date(w.resetsAt))}
									</Trans>
								)}
							</p>
						)}
					</div>
				))}
				{!windows.length && (
					<p className="text-[11px] text-muted-foreground">
						{account.billing === "api_key" ? (
							<Trans>API billing</Trans>
						) : (
							<Trans>Usage unavailable</Trans>
						)}
					</p>
				)}
			</div>
			<div className="usage-account-meta">
				<span>
					{reading.checkedAt ? (
						allCurrent ? (
							<Trans>
								Last checked {formatRelativeTime(reading.checkedAt)}
							</Trans>
						) : (
							<Trans>
								Last checked {formatRelativeTime(reading.checkedAt)} · not live
							</Trans>
						)
					) : needsSignIn ? (
						<span className="flex items-center gap-1">
							<AlertCircle size={11} />
							<Trans>Sign in again</Trans>
						</span>
					) : (
						<Trans>Usage unavailable</Trans>
					)}
				</span>
				{windows.length > primary.length && (
					<button
						type="button"
						className="usage-small-button"
						aria-expanded={expanded}
						onClick={() => setExpanded((v) => !v)}
					>
						<ChevronDown size={12} />
						{expanded ? <Trans>Less</Trans> : <Trans>More</Trans>}
					</button>
				)}
			</div>
			{needsSignIn && (
				<button
					type="button"
					className="usage-small-button mt-1"
					onClick={() => void window.UsageWidget.action("accounts")}
				>
					<Trans>Manage accounts</Trans>
				</button>
			)}
		</article>
	);
}
