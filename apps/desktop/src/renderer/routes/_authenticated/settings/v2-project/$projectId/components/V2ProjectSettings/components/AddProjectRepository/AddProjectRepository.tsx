import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	AddRepositoryMenu,
	type CloneSource,
} from "renderer/routes/_authenticated/components/AddRepositoryMenu";
import { hostRefusalReason } from "../../utils/hostRefusalReason";
import { cloneParentDir } from "./utils/cloneParentDir";

type RepositorySource =
	| { kind: "local"; path: string }
	| { kind: "clone"; url: string };

interface AddProjectRepositoryProps {
	projectId: string;
	/** Clones go beside it. */
	primaryPath: string | undefined;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	onChanged: () => void;
}

export function AddProjectRepository({
	projectId,
	primaryPath,
	hostUrl,
	hostName,
	isRemoteTarget,
	onChanged,
}: AddProjectRepositoryProps) {
	const { t } = useLingui();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const [remotePickerOpen, setRemotePickerOpen] = useState(false);
	const [cloning, setCloning] = useState<string[]>([]);

	const add = useMutation({
		mutationFn: async (sources: RepositorySource[]) => {
			if (!hostUrl) return;
			const client = getHostServiceClientByUrl(hostUrl);
			for (const source of sources) {
				await client.project.addRepository.mutate({
					projectId,
					source,
					...(source.kind === "clone"
						? { parentDir: cloneParentDir(primaryPath) }
						: {}),
				});
			}
		},
		// Sources are added one by one, so a failure can follow some that landed.
		onSettled: () => onChanged(),
		onError: (err) =>
			toast.error(t({ message: "Could not add the repository" }), {
				description: hostRefusalReason(errorMessage(err)),
			}),
	});

	const addLocal = async () => {
		if (isRemoteTarget) {
			setRemotePickerOpen(true);
			return;
		}
		try {
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Select repositories to add" }),
				multiple: true,
			});
			if (picked.canceled || picked.paths.length === 0) return;
			add.mutate(picked.paths.map((path) => ({ kind: "local", path })));
		} catch (err) {
			toast.error(errorMessage(err));
		}
	};

	const addClone = (source: CloneSource) => {
		if (cloning.includes(source.url)) return;
		setCloning((urls) => [...urls, source.url]);
		add.mutate([{ kind: "clone", url: source.url }], {
			onSettled: () =>
				setCloning((urls) => urls.filter((url) => url !== source.url)),
		});
	};

	return (
		<>
			<AddRepositoryMenu
				hostUrl={hostUrl}
				disabled={!hostUrl || selectDirectory.isPending || add.isPending}
				selectedCloneUrls={cloning}
				onAddLocal={() => void addLocal()}
				onToggleClone={addClone}
			/>
			<RemotePathPicker
				open={remotePickerOpen}
				onOpenChange={setRemotePickerOpen}
				hostUrl={hostUrl}
				hostName={hostName}
				initialPath={cloneParentDir(primaryPath)}
				title={t({ message: "Add repository" })}
				description={t({
					message: `Pick a repository folder on ${hostName}.`,
				})}
				confirmLabel={t({ message: "Use this folder" })}
				onPick={(path) => add.mutate([{ kind: "local", path }])}
			/>
		</>
	);
}
