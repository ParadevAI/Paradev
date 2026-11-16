/**
 * The icons an app may put on its host's header (`dev.ui.setActions`): one name each, drawn as the SF Symbol on
 * iPhone and iPad and as the Lucide icon on the Mac, so an app names an icon once and looks native on both.
 */
export const APP_UI_ICONS = {
	add: { sf: "plus", lucide: "Plus" },
	refresh: { sf: "arrow.clockwise", lucide: "RefreshCw" },
	search: { sf: "magnifyingglass", lucide: "Search" },
	filter: { sf: "line.3.horizontal.decrease", lucide: "ListFilter" },
	sort: { sf: "arrow.up.arrow.down", lucide: "ArrowUpDown" },
	share: { sf: "square.and.arrow.up", lucide: "Share" },
	edit: { sf: "pencil", lucide: "Pencil" },
	delete: { sf: "trash", lucide: "Trash2" },
	done: { sf: "checkmark", lucide: "Check" },
	calendar: { sf: "calendar", lucide: "Calendar" },
	settings: { sf: "gearshape", lucide: "Settings" },
	more: { sf: "ellipsis", lucide: "Ellipsis" },
	info: { sf: "info.circle", lucide: "Info" },
	star: { sf: "star", lucide: "Star" },
	list: { sf: "list.bullet", lucide: "List" },
	grid: { sf: "square.grid.2x2", lucide: "LayoutGrid" },
	chart: { sf: "chart.bar", lucide: "ChartColumn" },
} as const;

export type AppUiIcon = keyof typeof APP_UI_ICONS;

export const APP_UI_ICON_NAMES = Object.keys(APP_UI_ICONS) as [
	AppUiIcon,
	...AppUiIcon[],
];

/** At most this many header buttons: what fits beside the title on a phone. */
export const MAX_APP_ACTIONS = 3;
