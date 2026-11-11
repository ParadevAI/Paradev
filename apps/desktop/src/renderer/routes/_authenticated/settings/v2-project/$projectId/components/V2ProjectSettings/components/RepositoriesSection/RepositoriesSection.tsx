import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LuFolderGit2, LuPlus, LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface RepositoriesSectionProps {
	projectId: string;
	hostUrl: string | null;
}

export function RepositoriesSection({
	projectId,
	hostUrl,
}: RepositoriesSectionProps) {
	const { t } = useLingui();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const repositories = useQuery({
		queryKey: ["project-repositories", hostUrl, projectId],
		enabled: !!hostUrl,
		queryFn: () =>
			hostUrl
				? getHostServiceClientByUrl(hostUrl).project.repositories.query({
						projectId,
					})
				: [],
	});

	const add = useMutation({
		mutationFn: async () => {
			if (!hostUrl) return;
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Select repositories to add" }),
				multiple: true,
			});
			const client = getHostServiceClientByUrl(hostUrl);
			for (const repoPath of picked.paths) {
				await client.project.addRepository.mutate({ projectId, repoPath });
			}
		},
		onSuccess: () => repositories.refetch(),
		onError: (err) => toast.error(errorMessage(err)),
	});

	const remove = useMutation({
		mutationFn: (repositoryProjectId: string) =>
			hostUrl
				? getHostServiceClientByUrl(hostUrl).project.removeRepository.mutate({
						projectId,
						repositoryProjectId,
					})
				: Promise.resolve(),
		onSuccess: () => repositories.refetch(),
		onError: (err) => toast.error(errorMessage(err)),
	});

	return (
		<div className="flex w-96 flex-col gap-1.5">
			{(repositories.data ?? []).map((repository) => (
				<div
					key={repository.id}
					className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm"
				>
					<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="min-w-0 flex-1 truncate" title={repository.repoPath}>
						{repository.name}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-6"
						aria-label={t({ message: "Remove repository" })}
						disabled={remove.isPending}
						onClick={() => remove.mutate(repository.id)}
					>
						<LuX className="size-3.5" />
					</Button>
				</div>
			))}
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="self-start"
				disabled={!hostUrl || add.isPending}
				onClick={() => add.mutate()}
			>
				<LuPlus className="size-3.5" />
				<Trans>Add repository</Trans>
			</Button>
		</div>
	);
}
