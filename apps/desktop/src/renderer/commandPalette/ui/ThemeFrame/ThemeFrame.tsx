import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
	CommandSeparator,
	useCommandState,
} from "@superset/ui/command";
import { useEffect, useState } from "react";
import { ThemeSwatch } from "renderer/components/ThemeSwatch";
import {
	SYSTEM_THEME_ID,
	useSetTheme,
	useSystemDarkThemeId,
	useSystemLightThemeId,
	useThemeId,
	useThemeStore,
} from "renderer/stores";
import {
	builtInThemes,
	darkTheme as defaultDarkTheme,
	lightTheme as defaultLightTheme,
	type Theme,
} from "shared/themes";
import { useFrameStackStore } from "../../core/frames";
import { useCommandPaletteQuery } from "../CommandPalette/CommandPalette";

const SYSTEM_ITEM_VALUE = `system ${SYSTEM_THEME_ID}`;
const NAVIGATION_KEYS = new Set([
	"ArrowUp",
	"ArrowDown",
	"Home",
	"End",
	"PageUp",
	"PageDown",
]);

function themeItemValue(heading: string, theme: Theme): string {
	return `${heading} ${theme.name} ${theme.id}`;
}

function matchesQuery(haystack: string, query: string): boolean {
	if (!query) return true;
	return haystack.toLowerCase().includes(query.toLowerCase().trim());
}

export function ThemeFrame() {
	const { i18n } = useLingui();
	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const customThemes = useThemeStore((state) => state.customThemes);
	const systemLightThemeId = useSystemLightThemeId();
	const systemDarkThemeId = useSystemDarkThemeId();
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const query = useCommandPaletteQuery();
	const previewTheme = useThemeStore((state) => state.previewTheme);
	const endThemePreview = useThemeStore((state) => state.endThemePreview);
	const highlightedValue = useCommandState((state) => state.value);
	// cmdk highlights the first row on open; previewing it would swap the
	// theme before the user has pointed at anything.
	const [hasNavigated, setHasNavigated] = useState(false);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (NAVIGATION_KEYS.has(event.key)) setHasNavigated(true);
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, []);

	useEffect(() => endThemePreview, [endThemePreview]);

	const allThemes = [...builtInThemes, ...customThemes];
	const lightThemes = allThemes.filter((t) => t.type === "light");
	const darkThemes = allThemes.filter((t) => t.type === "dark");
	const customLight = lightThemes.filter((t) => t.isCustom);
	const customDark = darkThemes.filter((t) => t.isCustom);

	const systemLightTheme =
		allThemes.find((t) => t.id === systemLightThemeId) ??
		builtInThemes.find((t) => t.id === "light") ??
		defaultLightTheme;
	const systemDarkTheme =
		allThemes.find((t) => t.id === systemDarkThemeId) ??
		builtInThemes.find((t) => t.id === "dark") ??
		defaultDarkTheme;

	const pickTheme = (themeId: string) => {
		setTheme(themeId);
		setOpen(false);
	};

	const systemLabel = i18n._(
		msg({
			message: "System",
		}),
	);
	const lightHeading = i18n._(
		msg({
			message: "Light",
		}),
	);
	const darkHeading = i18n._(
		msg({
			message: "Dark",
		}),
	);
	const customHeading = i18n._(
		msg({
			message: "Custom",
		}),
	);

	const showSystem = matchesQuery(`${systemLabel} ${SYSTEM_THEME_ID}`, query);

	const visibleLight = filterThemes(
		lightThemes.filter((t) => !t.isCustom),
		lightHeading,
		query,
	);
	const visibleDark = filterThemes(
		darkThemes.filter((t) => !t.isCustom),
		darkHeading,
		query,
	);
	const visibleCustom = filterThemes(
		[...customLight, ...customDark],
		customHeading,
		query,
	);
	const hasThemeGroup =
		visibleLight.length > 0 ||
		visibleDark.length > 0 ||
		visibleCustom.length > 0;

	const themeIdByItemValue = new Map<string, string>([
		[SYSTEM_ITEM_VALUE, SYSTEM_THEME_ID],
	]);
	for (const [heading, themes] of [
		[lightHeading, visibleLight],
		[darkHeading, visibleDark],
		[customHeading, visibleCustom],
	] as const) {
		for (const theme of themes) {
			themeIdByItemValue.set(themeItemValue(heading, theme), theme.id);
		}
	}
	const previewThemeId =
		hasNavigated || query
			? themeIdByItemValue.get(highlightedValue)
			: undefined;

	useEffect(() => {
		if (previewThemeId) previewTheme(previewThemeId);
	}, [previewThemeId, previewTheme]);

	return (
		<CommandList onPointerMove={() => setHasNavigated(true)}>
			<CommandEmpty>
				<Trans>No themes found.</Trans>
			</CommandEmpty>

			{showSystem && (
				<CommandGroup>
					<CommandItem
						value={SYSTEM_ITEM_VALUE}
						onSelect={() => pickTheme(SYSTEM_THEME_ID)}
					>
						<div className="flex shrink-0 -space-x-1">
							<ThemeSwatch theme={systemLightTheme} />
							<ThemeSwatch theme={systemDarkTheme} />
						</div>
						<span>{systemLabel}</span>
						{activeThemeId === SYSTEM_THEME_ID ? (
							<span className="ml-auto text-xs text-muted-foreground">✓</span>
						) : null}
					</CommandItem>
				</CommandGroup>
			)}

			{showSystem && hasThemeGroup && <CommandSeparator />}

			<ThemeGroup
				heading={lightHeading}
				themes={visibleLight}
				activeId={activeThemeId}
				onSelect={pickTheme}
			/>

			<ThemeGroup
				heading={darkHeading}
				themes={visibleDark}
				activeId={activeThemeId}
				onSelect={pickTheme}
			/>

			<ThemeGroup
				heading={customHeading}
				themes={visibleCustom}
				activeId={activeThemeId}
				onSelect={pickTheme}
			/>
		</CommandList>
	);
}

function filterThemes(
	themes: Theme[],
	heading: string,
	query: string,
): Theme[] {
	return themes.filter((theme) =>
		matchesQuery(`${heading} ${theme.name} ${theme.id}`, query),
	);
}

interface ThemeGroupProps {
	heading: string;
	themes: Theme[];
	activeId: string;
	onSelect: (themeId: string) => void;
}

function ThemeGroup({ heading, themes, activeId, onSelect }: ThemeGroupProps) {
	if (themes.length === 0) return null;
	return (
		<CommandGroup heading={heading}>
			{themes.map((theme) => (
				<CommandItem
					key={`${heading}:${theme.id}`}
					value={themeItemValue(heading, theme)}
					onSelect={() => onSelect(theme.id)}
				>
					<ThemeSwatch theme={theme} />
					<span>{theme.name}</span>
					{theme.id === activeId ? (
						<span className="ml-auto text-xs text-muted-foreground">✓</span>
					) : null}
				</CommandItem>
			))}
		</CommandGroup>
	);
}
