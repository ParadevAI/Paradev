import "../globals.css";
import "./usage-widget.css";
import { msg } from "@lingui/core/macro";
import { I18nProvider } from "@lingui/react";
import { i18n, initI18nAsync, resolveLocale } from "@superset/i18n";
import { createRoot } from "react-dom/client";
import type { UsageWidgetBridge } from "../../preload/usage-widget";
import { PanelBoundary } from "./components/PanelBoundary/PanelBoundary";
import { ResetCelebration } from "./components/ResetCelebration/ResetCelebration";
import { UsagePanel } from "./UsagePanel";

declare global {
	interface Window {
		UsageWidget: UsageWidgetBridge;
	}
}
async function mount() {
	const snapshot = await window.UsageWidget.snapshot();
	await initI18nAsync(resolveLocale([snapshot.locale]));
	const root = document.getElementById("usage-root");
	if (!root) return;
	createRoot(root).render(
		<I18nProvider i18n={i18n}>
			<PanelBoundary>
				{snapshot.celebration ? (
					<ResetCelebration {...snapshot.celebration} />
				) : (
					<UsagePanel initial={snapshot} />
				)}
			</PanelBoundary>
		</I18nProvider>,
	);
}
void mount().catch(() => {
	const root = document.getElementById("usage-root");
	if (!root) return;
	const message = document.createElement("p");
	message.textContent = i18n._(
		msg({ message: "Could not load accounts. Refresh to try again." }),
	);
	const retry = document.createElement("button");
	retry.type = "button";
	retry.textContent = i18n._(msg({ message: "Retry" }));
	retry.onclick = () => location.reload();
	root.className = "usage-panel p-4";
	root.replaceChildren(message, retry);
});
