import { create } from "zustand";

interface TasksFilterState {
	tab: "all" | "active" | "backlog";
	assignee: string | null;
	setTab: (tab: "all" | "active" | "backlog") => void;
	setAssignee: (assignee: string | null) => void;
}

export const useTasksFilterStore = create<TasksFilterState>()((set) => ({
	tab: "all",
	assignee: null,
	setTab: (tab) => set({ tab }),
	setAssignee: (assignee) => set({ assignee }),
}));
