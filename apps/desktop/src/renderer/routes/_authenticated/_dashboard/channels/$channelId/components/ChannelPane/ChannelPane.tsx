import { Trans } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import type { ReactNode } from "react";
import { useHotkey } from "renderer/hotkeys";
import {
	type ChannelPanePage,
	useChannelPaneStore,
} from "../../stores/channelPaneStore";
import type { ChannelPerson } from "../MessageBody";
import { TaskPane } from "../TaskPane";
import { ActivityPage } from "./components/ActivityPage";
import {
	AgentPage,
	AgentPageActions,
	AgentPageTitle,
} from "./components/AgentPage";
import { ChannelOverview } from "./components/ChannelOverview";
import { ChannelRoutinesPage } from "./components/ChannelRoutinesPage";
import { CoordinatorPage } from "./components/CoordinatorPage";
import { MembersPage } from "./components/MembersPage";
import { PaneHeader } from "./components/PaneHeader";
import { ProfilePage } from "./components/ProfilePage";
import { PullRequestsPage } from "./components/PullRequestsPage";
import { SettingsPage } from "./components/SettingsPage";
import { TasksPage } from "./components/TasksPage";
import { ThreadPage } from "./components/ThreadPage";
import { useFocusWithin } from "./hooks/useFocusWithin";

type ChannelSummary = RouterOutputs["channel"]["get"];

export interface PanePageView {
	title: ReactNode;
	/** Controls in the pane header, after the title. */
	actions?: ReactNode;
	content: ReactNode;
}

export interface ChannelPaneProps {
	channelId: string;
	channel: ChannelSummary;
	isFullScreen: boolean;
	onToggleFullScreen: () => void;
	onHide: () => void;
	peopleById: Map<string, ChannelPerson>;
	people: ChannelPerson[];
	currentUserId: string | null;
	canModerate: boolean;
	canPost: boolean;
	now: Date;
	onRename?: () => void;
	onEditDescription?: () => void;
	onLeave: () => void;
	onArchive: () => void;
	/** What the pane shows with nothing pushed; the channel's overview unless the screen says otherwise. */
	root?: PanePageView;
	/** Pages a screen adds to the shared ones, such as a Dev's activity. */
	renderPage?: (page: ChannelPanePage) => PanePageView | null;
}

/**
 * The channel's side pane: one stack of pages with a way back at the top.
 * Opening a thread, a person or a task pushes a page; the root is the
 * channel at a glance.
 */
export function ChannelPane({
	channelId,
	channel,
	isFullScreen,
	onToggleFullScreen,
	onHide,
	peopleById,
	people,
	currentUserId,
	canModerate,
	canPost,
	now,
	onRename,
	onEditDescription,
	onLeave,
	onArchive,
	root,
	renderPage,
}: ChannelPaneProps) {
	const stack = useChannelPaneStore(
		(state) => state.panes[channelId]?.stack ?? EMPTY_STACK,
	);
	const push = useChannelPaneStore((state) => state.push);
	const pop = useChannelPaneStore((state) => state.pop);
	const page = stack.at(-1) ?? null;
	const focus = useFocusWithin();
	useHotkey(
		"CLOSE_PANE",
		() => {
			if (page) pop(channelId);
			else onHide();
		},
		{ ignoreEventWhen: () => !focus.isWithin() },
	);

	const view: PanePageView = page
		? (renderPage?.(page) ??
			sharedPage(page, {
				channelId,
				channel,
				peopleById,
				people,
				currentUserId,
				canModerate,
				canPost,
				now,
				onRename,
				onEditDescription,
				onLeave,
				onArchive,
				onOpen: (next) => push(channelId, next),
				onClose: () => pop(channelId),
			}))
		: (root ?? {
				title: <Trans>Overview</Trans>,
				content: (
					<ChannelOverview
						channelId={channelId}
						channel={channel}
						onOpen={(next) => push(channelId, next)}
					/>
				),
			});

	return (
		<div
			ref={focus.ref}
			className="flex h-full w-full min-w-0 flex-col bg-background"
		>
			<PaneHeader
				title={view.title}
				actions={view.actions}
				onBack={page ? () => pop(channelId) : undefined}
				isFullScreen={isFullScreen}
				onToggleFullScreen={onToggleFullScreen}
				onHide={onHide}
			/>
			<div
				key={page ? `${page.kind}:${"id" in page ? page.id : ""}` : "root"}
				className="flex min-h-0 flex-1 flex-col"
			>
				{view.content}
			</div>
		</div>
	);
}

const EMPTY_STACK: ChannelPanePage[] = [];

interface SharedPageContext {
	channelId: string;
	channel: ChannelSummary;
	peopleById: Map<string, ChannelPerson>;
	people: ChannelPerson[];
	currentUserId: string | null;
	canModerate: boolean;
	canPost: boolean;
	now: Date;
	onRename?: () => void;
	onEditDescription?: () => void;
	onLeave: () => void;
	onArchive: () => void;
	onOpen: (page: ChannelPanePage) => void;
	onClose: () => void;
}

function sharedPage(
	page: ChannelPanePage,
	context: SharedPageContext,
): PanePageView {
	switch (page.kind) {
		case "coordinator":
			return {
				title: <Trans>Coordinator</Trans>,
				content: (
					<CoordinatorPage
						channelId={context.channelId}
						channel={context.channel}
						onOpen={context.onOpen}
					/>
				),
			};
		case "agent":
			return {
				title: <AgentPageTitle workspaceId={page.id} />,
				actions: (
					<AgentPageActions
						workspaceId={page.id}
						channelName={context.channel.name}
						onClose={context.onClose}
					/>
				),
				content: (
					<AgentPage channelId={context.channelId} workspaceId={page.id} />
				),
			};
		case "activity":
			return {
				title: <Trans>Activity</Trans>,
				content: (
					<ActivityPage
						channelId={context.channelId}
						channelName={context.channel.name}
						peopleById={context.peopleById}
						people={context.people}
						currentUserId={context.currentUserId}
						canPost={context.canPost}
						onOpen={context.onOpen}
					/>
				),
			};
		case "pullRequests":
			return {
				title: <Trans>Pull requests</Trans>,
				content: (
					<PullRequestsPage
						channelName={context.channel.name}
						onOpen={context.onOpen}
					/>
				),
			};
		case "routines":
			return {
				title: <Trans>Automations</Trans>,
				content: <ChannelRoutinesPage channelId={context.channelId} />,
			};
		case "thread":
			return {
				title: <Trans>Thread</Trans>,
				content: (
					<ThreadPage
						channelId={context.channelId}
						messageId={page.id}
						peopleById={context.peopleById}
						people={context.people}
						currentUserId={context.currentUserId}
						canPost={context.canPost}
					/>
				),
			};
		case "task":
			return {
				title: <Trans>Task</Trans>,
				content: <TaskPane taskId={page.id} onClose={context.onClose} />,
			};
		case "profile":
			return {
				title: <Trans>Profile</Trans>,
				content: (
					<ProfilePage
						userId={page.id}
						isSelf={page.id === context.currentUserId}
					/>
				),
			};
		case "members":
			return {
				title: <Trans>People</Trans>,
				content: (
					<div className="min-h-0 flex-1 overflow-y-auto p-4">
						<MembersPage
							channel={context.channel}
							currentUserId={context.currentUserId}
						/>
					</div>
				),
			};
		case "tasks":
			return {
				title: <Trans>Tasks</Trans>,
				content: (
					<TasksPage channelId={context.channelId} canAdd={context.canPost} />
				),
			};
		default:
			return {
				title: <Trans>Settings</Trans>,
				content: (
					<SettingsPage
						channel={context.channel}
						onRename={context.onRename}
						onEditDescription={context.onEditDescription}
						onLeave={context.onLeave}
						onArchive={context.onArchive}
					/>
				),
			};
	}
}
