import { Trans, useLingui } from "@lingui/react/macro";
import { initI18nAsync, resolveLocale } from "@superset/i18n";
import { formatNumber } from "@superset/i18n/format";
import { getPresetIcon } from "@superset/ui/icons/preset-icons";
import {
	ArrowUpRight,
	ChevronRight,
	RefreshCw,
	Search,
	Settings,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	edgeAccounts,
	edgeHandleLayout,
	PROVIDER_NAMES,
	PROVIDERS,
	type WidgetSnapshot,
	widgetAccountGroups,
} from "shared/usage-widget/model";
import { AccountRow } from "./components/AccountRow/AccountRow";
import { EdgeHandle } from "./components/EdgeHandle";
import { EdgeSurface } from "./components/EdgeSurface/EdgeSurface";
import { HoverPreview } from "./components/HoverPreview";

export function UsagePanel({ initial }: { initial: WidgetSnapshot }) {
	const { t } = useLingui();
	const [state, setState] = useState(initial);
	const panelRef = useRef<HTMLElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState(initial.provider);
	const [showHidden, setShowHidden] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState(false);
	const [colorOpen, setColorOpen] = useState(false);
	const setAccountHidden = async (id: string | null, hidden: boolean) => {
		setSaving(true);
		setSaveError(false);
		try {
			await window.UsageWidget.setHidden(id, hidden);
			if (id === null) setShowHidden(false);
		} catch {
			setSaveError(true);
		} finally {
			setSaving(false);
		}
	};
	useEffect(
		() =>
			window.UsageWidget.subscribe((value) => {
				setState(value);
			}),
		[],
	);
	useEffect(() => {
		if (state.expanded) setFilter(state.provider);
		setSearch("");
	}, [state.provider, state.expanded]);
	useEffect(() => {
		void initI18nAsync(resolveLocale([state.locale]));
	}, [state.locale]);
	useEffect(() => {
		document.documentElement.classList.toggle(
			"light",
			!state.dark && state.surface !== "edge",
		);
		document.documentElement.lang = state.locale;
		for (const [key, value] of Object.entries(state.colors ?? {}))
			document.documentElement.style.setProperty(`--${key}`, value);
	}, [state.dark, state.surface, state.locale, state.colors]);
	useEffect(() => {
		if (!state.expanded || !panelRef.current || !contentRef.current) return;
		const panel = panelRef.current,
			content = contentRef.current;
		const measure = () => {
			if (colorOpen) {
				window.UsageWidget.resize(548);
				return;
			}
			const chrome = Array.from(panel.children)
				.filter((el) => !el.classList.contains("usage-scroll"))
				.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
			window.UsageWidget.resize(
				chrome +
					content.getBoundingClientRect().height +
					(state.surface === "edge" ? 20 : 2),
			);
		};
		const observer = new ResizeObserver(measure);
		observer.observe(content);
		measure();
		return () => observer.disconnect();
	}, [state.expanded, state.surface, colorOpen]);
	const action = (name: Parameters<typeof window.UsageWidget.action>[0]) =>
		void window.UsageWidget.action(name);
	const icon = (provider: string) =>
		getPresetIcon(provider, state.dark || state.surface === "edge");
	const groups = widgetAccountGroups(
		state.accounts,
		state.preferences,
		search,
		filter,
		showHidden,
	);
	const visible = edgeAccounts(state.accounts, state.preferences);
	const edgeLayout =
		state.edgeLayout ??
		edgeHandleLayout(visible.length, {
			width: window.innerWidth,
			height: window.innerHeight,
		});
	const handle = <EdgeHandle state={state} layout={edgeLayout} />;
	const hiddenCount = state.accounts.length - visible.length;
	const listed = showHidden ? state.accounts : visible;
	const resultCount = groups.reduce(
		(sum, group) => sum + group.accounts.length,
		0,
	);
	const host = state.hosts.find((h) => h.id === state.hostId);
	const panel = (
		<main
			ref={panelRef}
			className={`usage-panel ${state.surface === "edge" ? "usage-panel-edge" : ""}`}
			aria-label={t`AI usage`}
		>
			<header className="usage-header">
				<img src={icon("superset")} className="size-4" alt="" />
				<div className="min-w-0 flex-1">
					<h1 className="text-[13px] font-semibold">
						<Trans>AI usage</Trans>
					</h1>
					<p className="truncate text-[10px] text-muted-foreground">
						{host?.label ?? t`This device`}
					</p>
				</div>
				<button
					type="button"
					className="usage-icon-button"
					aria-label={t`Refresh usage`}
					disabled={state.loading || !state.hostId}
					onClick={() => action("refresh")}
				>
					<RefreshCw
						size={14}
						className={state.loading ? "motion-safe:animate-spin" : ""}
					/>
				</button>
				<button
					type="button"
					className="usage-icon-button"
					aria-label={t`Close`}
					onClick={() => action("close")}
				>
					<X size={15} />
				</button>
			</header>
			{state.accounts.length > 0 && (
				<div className="usage-toolbar">
					<div className="usage-filters">
						<button
							type="button"
							aria-pressed={!filter}
							className={`usage-filter ${!filter ? "active" : ""}`}
							onClick={() => setFilter(null)}
						>
							<Trans>All</Trans>{" "}
							<span className="text-muted-foreground">
								{formatNumber(listed.length)}
							</span>
						</button>
						{PROVIDERS.filter((p) =>
							state.accounts.some((a) => a.provider === p),
						).map((p) => (
							<button
								type="button"
								key={p}
								className={`usage-filter ${filter === p ? "active" : ""}`}
								aria-label={PROVIDER_NAMES[p]}
								aria-pressed={filter === p}
								title={PROVIDER_NAMES[p]}
								onClick={() => setFilter(p)}
							>
								<img src={icon(p)} alt="" className="size-3.5" />
								<span>
									{formatNumber(listed.filter((a) => a.provider === p).length)}
								</span>
							</button>
						))}
					</div>
					<span className="usage-metric">
						{state.preferences.metric === "remaining" ? (
							<Trans>Remaining</Trans>
						) : (
							<Trans>Used</Trans>
						)}
					</span>
				</div>
			)}
			{state.accounts.length > 5 && (
				<label className="usage-search">
					<Search size={13} />
					<input
						aria-label={t`Search accounts`}
						placeholder={t`Search accounts`}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</label>
			)}
			{hiddenCount > 0 && (
				<div className="usage-visibility-summary">
					<button
						type="button"
						className="usage-small-button"
						aria-pressed={showHidden}
						onClick={() => setShowHidden(!showHidden)}
					>
						<Trans>Show hidden</Trans> · {formatNumber(hiddenCount)}
					</button>
					<button
						type="button"
						className="usage-small-button"
						disabled={saving}
						onClick={() => void setAccountHidden(null, false)}
					>
						<Trans>Show all accounts</Trans>
					</button>
				</div>
			)}
			<div className="usage-scroll">
				<div ref={contentRef}>
					{state.offline && (
						<output className="block px-4 py-3 text-xs text-muted-foreground">
							<Trans>
								Usage unavailable. Open Superset to check the connection.
							</Trans>
						</output>
					)}
					{!state.accounts.length && !state.offline && (
						<output className="block p-4 text-xs text-muted-foreground">
							{state.loading ? (
								<Trans>Loading accounts…</Trans>
							) : state.inventoryUnavailable ? (
								<Trans>Usage unavailable</Trans>
							) : (
								<Trans>Add an account to see its usage here.</Trans>
							)}
						</output>
					)}
					{state.accounts.length > 0 && !resultCount && (
						<p className="p-4 text-xs text-muted-foreground">
							{hiddenCount === state.accounts.length && !showHidden ? (
								<Trans>All accounts are hidden.</Trans>
							) : (
								<Trans>No results</Trans>
							)}
						</p>
					)}
					{saveError && (
						<p role="alert" className="px-4 py-2 text-xs text-destructive">
							<Trans>Could not save usage display settings.</Trans>
						</p>
					)}
					{groups.map(
						({ provider, total, accounts }) =>
							accounts.length > 0 && (
								<section key={provider}>
									<h2 className="usage-provider">
										<img src={icon(provider)} alt="" className="size-3.5" />
										{PROVIDER_NAMES[provider]}
										<span className="ml-auto text-muted-foreground">
											{accounts.length !== total
												? `${formatNumber(accounts.length)} / `
												: ""}
											{formatNumber(total)}
										</span>
									</h2>
									{accounts.map(({ account, index, hidden }) => (
										<AccountRow
											key={account.id}
											account={account}
											state={state}
											index={index}
											hidden={hidden}
											saving={saving}
											onVisibilityChange={setAccountHidden}
											onColorChange={async (accountId, color) => {
												await window.UsageWidget.setAppearance(accountId, {
													color,
												});
											}}
											onColorOpenChange={setColorOpen}
										/>
									))}
								</section>
							),
					)}
				</div>
			</div>
			<footer className="usage-footer">
				<button type="button" onClick={() => action("accounts")}>
					<Trans>Manage accounts</Trans>
					<ArrowUpRight size={13} />
				</button>
				<button
					type="button"
					aria-label={t`Usage display settings`}
					onClick={() => action("settings")}
				>
					<Settings size={14} />
					<ChevronRight size={12} />
				</button>
			</footer>
		</main>
	);
	if (state.preview)
		return <HoverPreview state={state} accountId={state.preview} />;
	return state.surface === "edge" ? (
		<EdgeSurface
			expanded={state.expanded}
			panelHeight={state.panelHeight}
			transition={state.edgeTransition}
			layout={edgeLayout}
			handle={handle}
		>
			{panel}
		</EdgeSurface>
	) : (
		panel
	);
}
