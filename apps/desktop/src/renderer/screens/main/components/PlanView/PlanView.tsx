import type { RouterOutputs } from "@superset/api";
import { Plus } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { mockTasks } from "../../../../../lib/mock-data";
import { CreateTaskModal } from "./CreateTaskModal";
import { EditTaskModal } from "./EditTaskModal";
import { KanbanColumn } from "./KanbanColumn";
import { TaskPage } from "./TaskPage";

type Task = RouterOutputs["task"]["all"][number];

export const PlanView: React.FC = () => {
	// Initialize with mock tasks and add some variety to statuses
	const [tasks, setTasks] = useState<Task[]>(() => {
		// Modify some tasks to have different statuses for demo purposes
		return mockTasks.map((task: Task, index: number) => {
			if (index === 0 || index === 1)
				return { ...task, status: "todo" as const };
			if (index === 2 || index === 3)
				return { ...task, status: "planning" as const };
			if (index === 4) return { ...task, status: "needs-feedback" as const };
			if (index === 5) return { ...task, status: "completed" as const };
			return task;
		});
	});

	const [viewingTask, setViewingTask] = useState<Task | null>(null);
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

	// Group tasks by status
	const tasksByStatus = useMemo(() => {
		return {
			backlog: tasks.filter((t) => t.status === "backlog"),
			todo: tasks.filter((t) => t.status === "todo"),
			planning: tasks.filter((t) => t.status === "planning"),
			"needs-feedback": tasks.filter((t) => t.status === "needs-feedback"),
			completed: tasks.filter((t) => t.status === "completed"),
		};
	}, [tasks]);

	const handleCreateTask = (taskData: {
		title: string;
		description: string;
		status: Task["status"];
	}) => {
		const newTask: Task = {
			id: `temp-${Date.now()}`,
			slug: `SUPER-${tasks.length + 1}`,
			title: taskData.title,
			description: taskData.description,
			status: taskData.status,
			repositoryId: mockTasks[0].repositoryId,
			organizationId: mockTasks[0].organizationId,
			assigneeId: null,
			creatorId: mockTasks[0].creatorId,
			branch: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			assignee: null,
			creator: mockTasks[0].creator,
		};

		setTasks([...tasks, newTask]);
	};

	const handleUpdateTask = (
		taskId: string,
		updates: {
			title: string;
			description: string;
			status: Task["status"];
		},
	) => {
		setTasks(
			tasks.map((task) =>
				task.id === taskId
					? {
							...task,
							title: updates.title,
							description: updates.description,
							status: updates.status,
							updatedAt: new Date(),
						}
					: task,
			),
		);

		// Update viewingTask if it's the one being edited
		if (viewingTask?.id === taskId) {
			setViewingTask({
				...viewingTask,
				title: updates.title,
				description: updates.description,
				status: updates.status,
				updatedAt: new Date(),
			});
		}
	};

	// If viewing a task, show the task page
	if (viewingTask) {
		return (
			<TaskPage
				task={viewingTask}
				onBack={() => setViewingTask(null)}
				onUpdate={handleUpdateTask}
			/>
		);
	}

	// Otherwise, show the kanban board
	return (
		<div className="flex flex-col h-full bg-neutral-950">
			{/* Header */}
			<div className="flex items-center justify-between px-8 py-5 border-b border-neutral-800/50 backdrop-blur-sm bg-neutral-950/80">
				<div>
					<h1 className="text-base font-semibold text-white tracking-tight">
						Plan View
					</h1>
					<p className="text-xs text-neutral-500 mt-1">
						Manage and organize your tasks
					</p>
				</div>
				<button
					type="button"
					onClick={() => setIsCreateModalOpen(true)}
					className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-700/80 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm hover:shadow-md"
				>
					<Plus size={16} strokeWidth={2.5} />
					<span>New Task</span>
				</button>
			</div>

			{/* Kanban Board */}
			<div className="flex-1 overflow-x-auto overflow-y-hidden bg-gradient-to-b from-neutral-950 to-neutral-950/95">
				<div className="flex gap-5 p-8 h-full">
					<KanbanColumn
						title="Backlog"
						tasks={tasksByStatus.backlog}
						onTaskClick={setViewingTask}
						onTaskEdit={setEditingTask}
						statusColor="bg-neutral-500"
					/>
					<KanbanColumn
						title="Todo"
						tasks={tasksByStatus.todo}
						onTaskClick={setViewingTask}
						onTaskEdit={setEditingTask}
						statusColor="bg-blue-500"
					/>
					<KanbanColumn
						title="Pending"
						tasks={tasksByStatus.planning}
						onTaskClick={setViewingTask}
						onTaskEdit={setEditingTask}
						statusColor="bg-yellow-500"
					/>
					<KanbanColumn
						title="Needs Feedback"
						tasks={tasksByStatus["needs-feedback"]}
						onTaskClick={setViewingTask}
						onTaskEdit={setEditingTask}
						statusColor="bg-orange-500"
					/>
					<KanbanColumn
						title="Completed"
						tasks={tasksByStatus.completed}
						onTaskClick={setViewingTask}
						onTaskEdit={setEditingTask}
						statusColor="bg-green-600"
					/>
				</div>
			</div>

			{/* Create Task Modal */}
			<CreateTaskModal
				isOpen={isCreateModalOpen}
				onClose={() => setIsCreateModalOpen(false)}
				onCreate={handleCreateTask}
			/>

			{/* Edit Task Modal */}
			<EditTaskModal
				task={editingTask}
				isOpen={!!editingTask}
				onClose={() => setEditingTask(null)}
				onUpdate={handleUpdateTask}
			/>
		</div>
	);
};
