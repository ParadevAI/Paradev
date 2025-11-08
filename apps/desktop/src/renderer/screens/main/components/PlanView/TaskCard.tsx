import type React from "react";
import type { RouterOutputs } from "@superset/api";

type Task = RouterOutputs["task"]["all"][number];

interface TaskCardProps {
	task: Task;
	onClick: () => void;
}

const statusColors: Record<string, string> = {
	backlog: "bg-neutral-500",
	todo: "bg-blue-500",
	planning: "bg-yellow-500",
	working: "bg-amber-500",
	"needs-feedback": "bg-orange-500",
	"ready-to-merge": "bg-emerald-500",
	completed: "bg-green-600",
	canceled: "bg-red-500",
};

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => {
	const statusColor = statusColors[task.status] || "bg-neutral-500";

	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full bg-neutral-900/40 hover:bg-neutral-900/70 border border-neutral-800/50 hover:border-neutral-700/70 rounded-xl p-3.5 text-left transition-all group shadow-sm hover:shadow-md"
		>
			{/* Task header */}
			<div className="flex items-start gap-2 mb-2.5">
				<div className={`w-1.5 h-1.5 rounded-full ${statusColor} mt-1.5 shadow-sm`} />
				<span className="text-xs font-semibold text-neutral-500 group-hover:text-neutral-400 tracking-wide">
					{task.slug}
				</span>
			</div>

			{/* Task title */}
			<h3 className="text-sm font-medium text-neutral-200 group-hover:text-white mb-3 line-clamp-2 leading-snug">
				{task.title}
			</h3>

			{/* Task footer */}
			<div className="flex items-center justify-between mt-auto pt-1">
				{/* Assignee */}
				{task.assignee && (
					<div className="flex items-center gap-1.5">
						<img
							src={task.assignee.avatarUrl || "https://via.placeholder.com/24"}
							alt={task.assignee.name}
							className="w-6 h-6 rounded-full ring-2 ring-neutral-800 group-hover:ring-neutral-700 transition-all"
						/>
					</div>
				)}
				<div className="flex-1" />
			</div>
		</button>
	);
};
