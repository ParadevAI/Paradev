/** Group and project colors offered by every app. Names are translated in each app. */
export const PROJECT_COLOR_SWATCHES = [
	{ id: "red", value: "#ef4444" },
	{ id: "orange", value: "#f97316" },
	{ id: "yellow", value: "#eab308" },
	{ id: "lime", value: "#84cc16" },
	{ id: "green", value: "#22c55e" },
	{ id: "teal", value: "#14b8a6" },
	{ id: "cyan", value: "#06b6d4" },
	{ id: "blue", value: "#3b82f6" },
	{ id: "indigo", value: "#6366f1" },
	{ id: "purple", value: "#a855f7" },
	{ id: "pink", value: "#ec4899" },
	{ id: "slate", value: "#64748b" },
] as const;

export type ProjectColorId = (typeof PROJECT_COLOR_SWATCHES)[number]["id"];
