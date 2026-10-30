import type {
	ToolbarIcon,
	ToolbarIconName,
	ToolbarIconSource,
} from "./toolbarIcon.types";

const SF_SYMBOL: Record<ToolbarIconName, ToolbarIconSource> = {
	add: "plus",
	comments: "bubble.left.and.bubble.right",
	commentMode: "viewfinder",
	commentModeOn: "viewfinder.circle.fill",
	confirm: "checkmark",
	expand: "arrow.up.left.and.arrow.down.right",
	filter: "line.3.horizontal.decrease",
	filterActive: "line.3.horizontal.decrease.circle.fill",
	jumpToFile: "text.line.first.and.arrowtriangle.forward",
	more: "ellipsis",
	search: "magnifyingglass",
	sessions: "rectangle.stack",
	share: "square.and.arrow.up",
	stop: "stop.fill",
	voice: "waveform",
	voiceSettings: "slider.horizontal.3",
};

export const toolbarIcon: ToolbarIcon = (name) => SF_SYMBOL[name];
