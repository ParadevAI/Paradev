import { opaqueQuotaIdentity } from "./quota-widget-metadata";
import type { UsageAccount, UsageResetNotice } from "./types";

type Sample = { at: number; boundary: number; used: number };
type Row = {
	sample: Sample;
	pending?: Sample;
	notice?: UsageResetNotice;
	claimed?: boolean;
	touched: number;
};
const FRESH = 6 * 60_000;
const RECENT_RESET = 15 * 60_000;
const NOTICE_AGE = 10 * 60_000;
const MAX_ROWS = 2_048;

function windowKind(window: UsageAccount["windows"][number]) {
	if (
		window.id === "five_hour" ||
		window.id === "session" ||
		(["primary", "secondary"].includes(window.id) &&
			window.windowSeconds === 18_000)
	)
		return "session";
	if (
		window.id === "seven_day" ||
		window.id === "weekly" ||
		(["primary", "secondary"].includes(window.id) &&
			window.windowSeconds === 604_800)
	)
		return "weekly";
	return null;
}

export function createQuotaResetTracker(now = Date.now) {
	const rows = new Map<string, Row>();
	let visible = new Map<string, UsageResetNotice>();
	return {
		observe(accounts: UsageAccount[]): UsageAccount[] {
			const time = now();
			visible = new Map();
			for (const [key, row] of rows)
				if (time - row.touched > 8 * 24 * 60 * 60_000) rows.delete(key);
			const output = accounts.map((account) => {
				const { resetNotice: _notice, ...clean } = account;
				if (
					!account.quotaIdentity ||
					!account.plan ||
					!["claude", "codex"].includes(account.agent) ||
					account.credentialKind !== "subscription" ||
					account.status !== "ok"
				)
					return clean;
				const notices: UsageResetNotice[] = [];
				for (const window of account.windows) {
					const kind = windowKind(window);
					const boundary = window.resetsAt?.getTime();
					const measured =
						window.observedAt?.getTime() ?? account.fetchedAt.getTime();
					if (
						!kind ||
						!Number.isFinite(measured) ||
						measured > time ||
						time - measured > FRESH ||
						boundary === undefined ||
						!Number.isFinite(boundary) ||
						boundary <= time ||
						!Number.isFinite(window.usedPercent) ||
						window.usedPercent < 0 ||
						window.usedPercent > 100
					)
						continue;
					const key = opaqueQuotaIdentity(
						account.agent,
						account.quotaIdentity,
						JSON.stringify([account.plan, kind]),
					);
					const sample = {
						at: measured,
						boundary,
						used: window.usedPercent,
					};
					let row = rows.get(key);
					if (!row) row = { sample, touched: time };
					else if (
						sample.at > row.sample.at &&
						sample.boundary >= row.sample.boundary
					) {
						const old = row.sample;
						if (
							row.pending &&
							sample.boundary === row.pending.boundary &&
							sample.at - row.pending.at >= 10_000
						) {
							if (sample.at - old.boundary <= RECENT_RESET) {
								row.notice = {
									id: opaqueQuotaIdentity("reset", key, String(boundary)),
									kind,
									confirmedAt: new Date(sample.at),
								};
								row.claimed = false;
							}
							row.sample = sample;
							row.pending = undefined;
						} else if (
							!row.pending &&
							sample.boundary > old.boundary &&
							old.boundary <= sample.at &&
							sample.at - old.boundary <= RECENT_RESET &&
							(old.used === 0 || sample.used < old.used) &&
							sample.boundary - old.boundary >=
								(kind === "weekly" ? 604_800_000 : 18_000_000) / 2
						)
							row.pending = sample;
						else if (!row.pending || sample.boundary !== row.pending.boundary) {
							row.sample = sample;
							row.pending = undefined;
						}
					}
					row.touched = time;
					rows.delete(key);
					rows.set(key, row);
					if (
						row.notice &&
						time - row.notice.confirmedAt.getTime() <= NOTICE_AGE
					) {
						notices.push(row.notice);
						if (!row.claimed) visible.set(row.notice.id, row.notice);
					}
				}
				const notice =
					notices.find((notice) => notice.kind === "weekly") ?? notices[0];
				return notice ? { ...clean, resetNotice: notice } : clean;
			});
			while (rows.size > MAX_ROWS) {
				const oldest = rows.keys().next().value;
				if (oldest === undefined) break;
				rows.delete(oldest);
			}
			return output;
		},
		claim(ids: string[]) {
			const result: UsageResetNotice[] = [];
			for (const id of new Set(ids)) {
				const notice = visible.get(id);
				if (!notice || now() - notice.confirmedAt.getTime() > NOTICE_AGE)
					continue;
				visible.delete(id);
				for (const row of rows.values())
					if (row.notice?.id === id) row.claimed = true;
				result.push(notice);
			}
			return result;
		},
		clear() {
			rows.clear();
			visible.clear();
		},
	};
}
