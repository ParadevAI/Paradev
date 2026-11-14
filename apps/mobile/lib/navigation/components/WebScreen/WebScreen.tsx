import { BRAND } from "@superset/shared/brand";
import { useIsFocused, useNavigationContainerRef } from "expo-router";
import { useEffect } from "react";
import type { ScreenLayoutProps } from "../../screenLayout.types";
import { isWebSheet } from "../../utils/isWebSheet";
import { WebSheet } from "./components/WebSheet";

const DISMISSIBLE_PRESENTATIONS = new Set([
	"modal",
	"transparentModal",
	"containedModal",
	"containedTransparentModal",
	"fullScreenModal",
	"formSheet",
	"pageSheet",
]);

const OPEN_OVERLAY =
	'[aria-modal="true"]:not([data-web-sheet]), [role="menu"], [role="listbox"]';

/** Names the browser tab after the screen, lets Escape close a sheet, and draws sheet routes as dialogs. */
export function WebScreen({
	navigation,
	route,
	options,
	children,
}: ScreenLayoutProps) {
	const focused = useIsFocused();
	const container = useNavigationContainerRef();
	const dismissible =
		options.presentation !== undefined &&
		DISMISSIBLE_PRESENTATIONS.has(options.presentation);

	const ownTitle = options.title;
	useEffect(() => {
		if (!focused) return;
		const sync = () => {
			const current = container.getCurrentOptions() as
				| { title?: string }
				| undefined;
			const title = current?.title ?? ownTitle;
			document.title = title ? `${title} · ${BRAND.NAME}` : BRAND.NAME;
		};
		sync();
		return container.addListener("state", sync);
	}, [focused, container, ownTitle]);

	useEffect(() => {
		if (!focused || !dismissible) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.isComposing) return;
			if (event.defaultPrevented || document.querySelector(OPEN_OVERLAY))
				return;
			event.preventDefault();
			navigation.goBack();
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [focused, dismissible, navigation]);

	if (!isWebSheet(options)) return children;

	return (
		<WebSheet
			routeKey={route.key}
			title={options.title}
			detents={options.sheetAllowedDetents}
			focused={focused}
			onClose={() => navigation.goBack()}
		>
			{children}
		</WebSheet>
	);
}
