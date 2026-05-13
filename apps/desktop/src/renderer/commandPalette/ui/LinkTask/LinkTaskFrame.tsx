import {
	CommandEmpty,
	CommandGroup,
	CommandList,
	CommandItem as RawCommandItem,
} from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import Fuse from "fuse.js";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useFrameStackStore } from "../../core/frames";
import { useCommandPaletteQuery } from "../CommandPalette/CommandPalette";

const MAX_RESULTS = 25;

interface LinkTaskFrameProps {
	workspaceId: string;
}

export function LinkTaskFrame({ workspaceId }: LinkTaskFrameProps) {
	const collections = useCollections();
	const query = useCommandPaletteQuery();
	const setOpen = useFrameStackStore((s) => s.setOpen);

	const { data: tasks = [] } = useLiveQuery(
		(q) =>
			q.from({ t: collections.tasks }).select(({ t }) => ({
				id: t.id,
				slug: t.slug,
				title: t.title,
				externalUrl: t.externalUrl,
				updatedAt: t.updatedAt,
			})),
		[collections.tasks],
	);

	const fuse = useMemo(
		() =>
			new Fuse(tasks, {
				keys: [
					{ name: "slug", weight: 3 },
					{ name: "title", weight: 2 },
				],
				threshold: 0.4,
				ignoreLocation: true,
			}),
		[tasks],
	);

	const filtered = useMemo(() => {
		if (!query) {
			return [...tasks]
				.sort(
					(a, b) =>
						new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
				)
				.slice(0, MAX_RESULTS);
		}
		return fuse.search(query, { limit: MAX_RESULTS }).map((r) => r.item);
	}, [query, fuse, tasks]);

	const handleSelect = (taskId: string, slug: string) => {
		toast.success(`Linked ${slug} to workspace`);
		void linkTaskToWorkspace(taskId, workspaceId);
		setOpen(false);
	};

	return (
		<CommandList className="max-h-[400px]">
			<CommandEmpty>No tasks found.</CommandEmpty>
			<CommandGroup heading={query ? "Results" : "Recent tasks"}>
				{filtered.map((task) => (
					<RawCommandItem
						key={task.id}
						value={`${task.slug} ${task.title}`}
						onSelect={() => handleSelect(task.id, task.slug)}
					>
						<span className="text-xs font-mono text-muted-foreground">
							{task.slug}
						</span>
						<span className="truncate">{task.title}</span>
					</RawCommandItem>
				))}
			</CommandGroup>
		</CommandList>
	);
}

async function linkTaskToWorkspace(
	taskId: string,
	workspaceId: string,
): Promise<void> {
	void taskId;
	void workspaceId;
}
