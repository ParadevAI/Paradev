import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import type React from "react";
import { useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { AppFrame } from "../AppFrame";
import { Background } from "../Background";
import { AddTaskModal } from "./AddTaskModal";
import { TaskTabs } from "./TaskTabs";
import { WorktreeTabView } from "./WorktreeTabView";

// Mock tasks data - TODO: Replace with actual task data from backend
const MOCK_TASKS = [
	{
		id: "1",
		slug: "SSET-1",
		name: "Homepage Redesign",
		status: "working" as const,
		branch: "feature/homepage-redesign",
		description: "Redesigning the homepage with new branding and improved UX",
		assignee: "Alice",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=1",
		lastUpdated: "2 hours ago"
	},
	{
		id: "2",
		slug: "SSET-2",
		name: "API Integration",
		status: "needs-feedback" as const,
		branch: "feature/api-integration",
		description: "Integrate new REST API endpoints for user management",
		assignee: "Bob",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=12",
		lastUpdated: "1 day ago"
	},
	{
		id: "3",
		slug: "SSET-3",
		name: "Bug Fixes",
		status: "planning" as const,
		branch: "fix/various-bugs",
		description: "Collection of bug fixes reported by users",
		assignee: "Charlie",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=33",
		lastUpdated: "3 days ago"
	},
	{
		id: "4",
		slug: "SSET-4",
		name: "Performance Optimization",
		status: "ready-to-merge" as const,
		branch: "perf/optimize-queries",
		description: "Optimize database queries for faster page loads",
		assignee: "Diana",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=9",
		lastUpdated: "5 minutes ago"
	},
	{
		id: "5",
		slug: "SSET-5",
		name: "User Authentication System",
		status: "working" as const,
		branch: "feature/auth-system",
		description: "Implement OAuth2 and JWT-based authentication system with refresh tokens",
		assignee: "Eve",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=5",
		lastUpdated: "3 hours ago"
	},
	{
		id: "6",
		slug: "SSET-6",
		name: "Dark Mode Support",
		status: "planning" as const,
		branch: "feature/dark-mode",
		description: "Add dark mode theme support across the entire application",
		assignee: "Frank",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=13",
		lastUpdated: "2 days ago"
	},
	{
		id: "7",
		slug: "SSET-7",
		name: "Database Migration Scripts",
		status: "ready-to-merge" as const,
		branch: "db/migration-scripts",
		description: "Create automated migration scripts for production database updates",
		assignee: "Grace",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=20",
		lastUpdated: "1 hour ago"
	},
	{
		id: "8",
		slug: "SSET-8",
		name: "Email Notification Service",
		status: "needs-feedback" as const,
		branch: "feature/email-notifications",
		description: "Build email notification service using SendGrid for transactional emails",
		assignee: "Henry",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=8",
		lastUpdated: "4 hours ago"
	},
	{
		id: "9",
		slug: "SSET-9",
		name: "Mobile Responsive Design",
		status: "working" as const,
		branch: "feature/mobile-responsive",
		description: "Make the application fully responsive for mobile and tablet devices",
		assignee: "Iris",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=16",
		lastUpdated: "6 hours ago"
	},
	{
		id: "10",
		slug: "SSET-10",
		name: "Analytics Dashboard",
		status: "planning" as const,
		branch: "feature/analytics-dashboard",
		description: "Create admin dashboard with charts and metrics for user analytics",
		assignee: "Jack",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=11",
		lastUpdated: "1 week ago"
	},
	{
		id: "11",
		slug: "SSET-11",
		name: "CI/CD Pipeline",
		status: "ready-to-merge" as const,
		branch: "devops/ci-cd-pipeline",
		description: "Set up automated CI/CD pipeline with GitHub Actions and Docker",
		assignee: "Kate",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=25",
		lastUpdated: "30 minutes ago"
	},
	{
		id: "12",
		slug: "SSET-12",
		name: "Search Functionality",
		status: "working" as const,
		branch: "feature/search",
		description: "Implement full-text search with Elasticsearch integration",
		assignee: "Liam",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=14",
		lastUpdated: "5 hours ago"
	},
	{
		id: "13",
		slug: "SSET-13",
		name: "File Upload System",
		status: "needs-feedback" as const,
		branch: "feature/file-uploads",
		description: "Build secure file upload system with S3 storage and virus scanning",
		assignee: "Mia",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=27",
		lastUpdated: "2 hours ago"
	},
	{
		id: "14",
		slug: "SSET-14",
		name: "API Rate Limiting",
		status: "planning" as const,
		branch: "feature/rate-limiting",
		description: "Implement rate limiting and throttling for API endpoints",
		assignee: "Noah",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=17",
		lastUpdated: "4 days ago"
	},
	{
		id: "15",
		slug: "SSET-15",
		name: "Internationalization",
		status: "working" as const,
		branch: "feature/i18n",
		description: "Add multi-language support with i18next for English, Spanish, and French",
		assignee: "Olivia",
		assigneeAvatarUrl: "https://i.pravatar.cc/150?img=32",
		lastUpdated: "8 hours ago"
	},
];

export const NewLayoutMain: React.FC = () => {
	const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [showSidebarOverlay, setShowSidebarOverlay] = useState(false);
	const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
	// Initialize with first 4 tasks to match the tabs currently displayed
	const [openTasks, setOpenTasks] = useState<typeof MOCK_TASKS>(
		MOCK_TASKS.slice(0, 4)
	);
	const [activeTaskId, setActiveTaskId] = useState(MOCK_TASKS[0].id);
	const [allTasks, setAllTasks] = useState(MOCK_TASKS);

	const handleCollapseSidebar = () => {
		const panel = sidebarPanelRef.current;
		if (panel && !panel.isCollapsed()) {
			panel.collapse();
			setIsSidebarOpen(false);
		}
	};

	const handleExpandSidebar = () => {
		const panel = sidebarPanelRef.current;
		if (panel && panel.isCollapsed()) {
			panel.expand();
			setIsSidebarOpen(true);
		}
	};

	const handleOpenAddTaskModal = () => {
		setIsAddTaskModalOpen(true);
	};

	const handleCloseAddTaskModal = () => {
		setIsAddTaskModalOpen(false);
	};

	const handleSelectTask = (task: typeof MOCK_TASKS[0]) => {
		// Check if task is already open
		const isAlreadyOpen = openTasks.some((t) => t.id === task.id);
		if (!isAlreadyOpen) {
			// Add to open tasks and make it active
			setOpenTasks([...openTasks, task]);
			setActiveTaskId(task.id);
		} else {
			// Task is already open, just switch focus to it
			setActiveTaskId(task.id);
		}
	};

	const handleCreateTask = (taskData: {
		name: string;
		description: string;
		status: "planning" | "working" | "needs-feedback" | "ready-to-merge";
		assignee: string;
		branch: string;
	}) => {
		// Generate new task with mock data
		const newTask = {
			id: String(allTasks.length + 1),
			slug: `SSET-${allTasks.length + 1}`,
			name: taskData.name,
			status: taskData.status,
			branch: taskData.branch,
			description: taskData.description,
			assignee: taskData.assignee,
			assigneeAvatarUrl: "https://i.pravatar.cc/150?img=1", // Default avatar
			lastUpdated: "Just now",
		};

		// Add to all tasks
		setAllTasks([...allTasks, newTask]);

		// Open the new task
		setOpenTasks([...openTasks, newTask]);
		setActiveTaskId(newTask.id);
	};

	return (
		<>
			<Background />

			{/* Hover trigger area when sidebar is hidden */}
			{!isSidebarOpen && (
				<div
					className="fixed left-0 top-0 bottom-0 w-2 z-50"
					onMouseEnter={() => setShowSidebarOverlay(true)}
				/>
			)}

			{/* Sidebar overlay when hidden and hovering */}
			{!isSidebarOpen && showSidebarOverlay && (
				<div
					className="fixed left-0 top-0 bottom-0 w-80 z-40 animate-in slide-in-from-left duration-200"
					onMouseLeave={() => setShowSidebarOverlay(false)}
				>
					<div className="h-full border-r border-neutral-800 bg-neutral-950/95 backdrop-blur-sm">
						<WorktreeTabView />
					</div>
				</div>
			)}

			<AppFrame>
				<div className="flex flex-col h-full w-full">
					{/* Task tabs at the top */}
					<TaskTabs
						onCollapseSidebar={handleCollapseSidebar}
						onExpandSidebar={handleExpandSidebar}
						isSidebarOpen={isSidebarOpen}
						onAddTask={handleOpenAddTaskModal}
						activeTaskId={activeTaskId}
						onActiveTaskChange={setActiveTaskId}
						openTasks={openTasks}
					/>

					{/* Main content area with resizable sidebar */}
					<div className="flex-1 overflow-hidden border-t border-neutral-700">
						<ResizablePanelGroup direction="horizontal" autoSaveId="new-layout-panels">
							{/* Sidebar panel with worktree tab view */}
							<ResizablePanel
								ref={sidebarPanelRef}
								defaultSize={25}
								minSize={15}
								maxSize={40}
								collapsible
								onCollapse={() => setIsSidebarOpen(false)}
								onExpand={() => setIsSidebarOpen(true)}
							>
								<WorktreeTabView />
							</ResizablePanel>

							<ResizableHandle />

							{/* Main content panel */}
							<ResizablePanel defaultSize={75} minSize={30}>
								<div className="h-full bg-[#1e1e1e] flex items-center justify-center p-12 m-1 rounded-lg">
									<div>
										<h2 className="text-2xl font-semibold text-neutral-400">
											New UI Mock
										</h2>
										<p className="text-neutral-500 text-sm">
											Main content area (terminal/preview will go here)
										</p>
									</div>
								</div>
							</ResizablePanel>
						</ResizablePanelGroup>
					</div>
				</div>
			</AppFrame>

			{/* Open Task Modal */}
			<AddTaskModal
				isOpen={isAddTaskModalOpen}
				onClose={handleCloseAddTaskModal}
				tasks={allTasks}
				openTasks={openTasks}
				onSelectTask={handleSelectTask}
				onCreateTask={handleCreateTask}
			/>
		</>
	);
};
