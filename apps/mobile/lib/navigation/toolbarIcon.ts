import type {
	ToolbarIcon,
	ToolbarIconName,
	ToolbarIconSource,
} from "./toolbarIcon.types";

// Material Symbols from scripts/generate-toolbar-icons.ts: a toolbar item here
// takes an image source, and an item without one draws nothing.
const DRAWABLE: Record<ToolbarIconName, ToolbarIconSource | undefined> = {
	add: require("./toolbar-icons/add.xml"),
	close: undefined,
	comments: require("./toolbar-icons/comments.xml"),
	commentMode: require("./toolbar-icons/commentMode.xml"),
	commentModeOn: require("./toolbar-icons/commentModeOn.xml"),
	confirm: require("./toolbar-icons/confirm.xml"),
	expand: require("./toolbar-icons/expand.xml"),
	filter: require("./toolbar-icons/filter.xml"),
	filterActive: require("./toolbar-icons/filterActive.xml"),
	fix: undefined,
	jumpToFile: require("./toolbar-icons/jumpToFile.xml"),
	link: undefined,
	mic: undefined,
	micOff: undefined,
	more: require("./toolbar-icons/more.xml"),
	overflow: undefined,
	search: require("./toolbar-icons/search.xml"),
	send: require("./toolbar-icons/send.xml"),
	sessions: require("./toolbar-icons/sessions.xml"),
	share: require("./toolbar-icons/share.xml"),
	stop: require("./toolbar-icons/stop.xml"),
	submit: undefined,
	voice: require("./toolbar-icons/voice.xml"),
	voiceSettings: require("./toolbar-icons/voiceSettings.xml"),
};

export const toolbarIcon: ToolbarIcon = (name) => DRAWABLE[name];
