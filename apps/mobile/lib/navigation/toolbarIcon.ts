import type {
	ToolbarIcon,
	ToolbarIconName,
	ToolbarIconSource,
} from "./toolbarIcon.types";

// Material Symbols from scripts/generate-toolbar-icons.ts: a toolbar item here
// takes an image source and draws nothing for an SF Symbol name.
const DRAWABLE: Record<ToolbarIconName, ToolbarIconSource> = {
	add: require("./toolbar-icons/add.xml"),
	comments: require("./toolbar-icons/comments.xml"),
	commentMode: require("./toolbar-icons/commentMode.xml"),
	commentModeOn: require("./toolbar-icons/commentModeOn.xml"),
	confirm: require("./toolbar-icons/confirm.xml"),
	expand: require("./toolbar-icons/expand.xml"),
	filter: require("./toolbar-icons/filter.xml"),
	filterActive: require("./toolbar-icons/filterActive.xml"),
	jumpToFile: require("./toolbar-icons/jumpToFile.xml"),
	more: require("./toolbar-icons/more.xml"),
	search: require("./toolbar-icons/search.xml"),
	send: require("./toolbar-icons/send.xml"),
	sessions: require("./toolbar-icons/sessions.xml"),
	share: require("./toolbar-icons/share.xml"),
	stop: require("./toolbar-icons/stop.xml"),
	voice: require("./toolbar-icons/voice.xml"),
	voiceSettings: require("./toolbar-icons/voiceSettings.xml"),
};

export const toolbarIcon: ToolbarIcon = (name) => DRAWABLE[name];
