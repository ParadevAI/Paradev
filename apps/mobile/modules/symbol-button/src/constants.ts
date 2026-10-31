import {
	Ban,
	CircleQuestionMark,
	Ellipsis,
	FlaskConical,
	LayoutGrid,
	type LucideIcon,
	Map as MapIcon,
	Search,
	Shuffle,
	TestTubes,
	ThumbsUp,
	Trash2,
	TrendingDown,
} from "lucide-react-native";

/** The SF Symbol names callers pass, drawn with their closest lucide icon. */
export const SYMBOL_ICONS: Record<string, LucideIcon> = {
	"chart.line.downtrend.xyaxis": TrendingDown,
	ellipsis: Ellipsis,
	flask: FlaskConical,
	"hand.thumbsup": ThumbsUp,
	magnifyingglass: Search,
	map: MapIcon,
	nosign: Ban,
	"questionmark.circle": CircleQuestionMark,
	shuffle: Shuffle,
	"square.grid.2x2": LayoutGrid,
	"testtube.2": TestTubes,
	trash: Trash2,
};
