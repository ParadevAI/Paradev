import type {
	ToolbarIcon,
	ToolbarIconName,
	ToolbarIconSource,
} from "./toolbarIcon.types";

const SF_SYMBOL: Record<ToolbarIconName, ToolbarIconSource> = {
	add: "plus",
	close: "xmark",
	comments: "bubble.left.and.bubble.right",
	commentMode: "viewfinder",
	commentModeOn: "viewfinder.circle.fill",
	confirm: "checkmark",
	expand: "arrow.up.left.and.arrow.down.right",
	filter: "line.3.horizontal.decrease",
	filterActive: "line.3.horizontal.decrease.circle.fill",
	fix: "wrench.and.screwdriver",
	jumpToFile: "text.line.first.and.arrowtriangle.forward",
	link: "link",
	mic: "mic.fill",
	micOff: "mic.slash.fill",
	more: "ellipsis",
	overflow: "ellipsis",
	search: "magnifyingglass",
	send: "paperplane",
	sessions: "rectangle.stack",
	share: "square.and.arrow.up",
	stop: "stop.fill",
	submit: "checkmark",
	voice: "waveform",
	voiceSettings: "slider.horizontal.3",
};

export const toolbarIcon: ToolbarIcon = (name) => SF_SYMBOL[name];
