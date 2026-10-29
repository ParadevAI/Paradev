import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Dialog, DialogContent } from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { env } from "renderer/env.renderer";
import { useCreateAgentSession } from "renderer/hooks/useCreateAgentSession";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ChoosePrimaryStep } from "./components/ChoosePrimaryStep";
import { ConnectGitHubStep } from "./components/ConnectGitHubStep";
import { PickRepositoriesStep } from "./components/PickRepositoriesStep";
import { setupPrompt } from "./utils/setupPrompt";

interface CreateEnvironmentFlowProps {
	organizationId: string;
	projectId?: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onStarted?: () => void;
}

export function CreateEnvironmentFlow({
	organizationId,
	projectId,
	open,
	onOpenChange,
	onStarted,
}: CreateEnvironmentFlowProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	// Both connections finish in the browser; coming back to the window is
	// when they appear.
	const installation = cloudTrpc.integration.github.getInstallation.useQuery(
		{ organizationId },
		{ enabled: open, refetchOnWindowFocus: "always" },
	);
	const githubUser = cloudTrpc.githubUser.get.useQuery(undefined, {
		enabled: open,
		refetchOnWindowFocus: "always",
	});
	const usage = cloudTrpc.billing.environmentUsage.useQuery(undefined, {
		enabled: open,
	});
	const navigate = useNavigate();
	const [skippedAccount, setSkippedAccount] = useState(false);
	// Set once several repositories are picked: the step that asks for the primary.
	const [picked, setPicked] = useState<ReadonlyArray<{
		id: string;
		name: string;
		fullName: string;
	}> | null>(null);
	const [pickedIds, setPickedIds] = useState<string[]>([]);
	const create = cloudTrpc.environment.create.useMutation();
	const { createSession, isPending: isLaunching } = useCreateAgentSession();

	const activeInstallation =
		installation.data && !installation.data.suspended
			? installation.data
			: null;
	const appInstalled = activeInstallation !== null;
	const accountConnected = !!githubUser.data?.connection;
	const accountAvailable = githubUser.data?.available !== false;
	const isLoading = installation.isPending || githubUser.isPending;
	const needsConnecting =
		!appInstalled || (accountAvailable && !accountConnected && !skippedAccount);

	const reachedLimit =
		usage.data?.limit != null && usage.data.used >= usage.data.limit
			? usage.data.limit
			: null;

	const openGitHubIntegration = () => {
		window.open(`${env.NEXT_PUBLIC_WEB_URL}/integrations/github`, "_blank");
	};

	const getStarted = async (
		repositories: ReadonlyArray<{ id: string; name: string }>,
		primaryId = repositories[0]?.id,
	) => {
		const primary = repositories.find(
			(repository) => repository.id === primaryId,
		);
		if (!primary) return;
		try {
			const environment = await create.mutateAsync({
				organizationId,
				name: primary.name,
				repositoryIds: [
					primary.id,
					...repositories
						.filter((repository) => repository.id !== primary.id)
						.map((repository) => repository.id),
				],
				primaryRepositoryId: primary.id,
				scope: "personal",
				...(projectId ? { projectId } : {}),
			});
			void utils.environment.list.invalidate();
			void utils.billing.environmentUsage.invalidate();
			const url = new URL(
				`/environments/${environment.id}`,
				env.NEXT_PUBLIC_WEB_URL,
			).toString();
			// Stays open, saying Starting…, until the session's page replaces this one.
			await createSession(setupPrompt(url), {
				preset: "claude",
				preferChat: true,
				name: t({ message: `Set up ${environment.name}` }),
			});
			onOpenChange(false);
			onStarted?.();
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="flex flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[480px]">
				{needsConnecting ? (
					<ConnectGitHubStep
						accountAvailable={accountAvailable}
						accountLogin={githubUser.data?.connection?.login ?? null}
						appAccountLogin={activeInstallation?.accountLogin ?? null}
						isLoading={isLoading}
						onCancel={() => onOpenChange(false)}
						onContinue={() => setSkippedAccount(true)}
						onInstallApp={openGitHubIntegration}
					/>
				) : picked ? (
					<ChoosePrimaryStep
						isStarting={create.isPending || isLaunching}
						onBack={() => setPicked(null)}
						onGetStarted={(primaryId) => getStarted(picked, primaryId)}
						repositories={picked}
					/>
				) : (
					<PickRepositoriesStep
						initialSelectedIds={pickedIds}
						accountLogin={githubUser.data?.connection?.login ?? null}
						installation={activeInstallation}
						isStarting={create.isPending || isLaunching}
						reachedLimit={reachedLimit}
						onManageEnvironments={() => {
							onOpenChange(false);
							void navigate({ to: "/settings/environments" });
						}}
						onUpgrade={() => {
							onOpenChange(false);
							void navigate({ to: "/settings/billing/plans" });
						}}
						onCancel={() => onOpenChange(false)}
						onContinue={(repositories) => {
							setPickedIds(repositories.map((repository) => repository.id));
							if (repositories.length > 1) setPicked(repositories);
							else void getStarted(repositories);
						}}
						organizationId={organizationId}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
