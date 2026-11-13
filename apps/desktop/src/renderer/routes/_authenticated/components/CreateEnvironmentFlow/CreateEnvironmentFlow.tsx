import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { isCloudUsageRefusal } from "@superset/shared/billing";
import { Dialog, DialogContent } from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { environmentSetupAgentPrompt } from "renderer/routes/_authenticated/utils/environmentSetupPrompt";
import { ChoosePrimaryStep } from "./components/ChoosePrimaryStep";
import { ConnectGitHubStep } from "./components/ConnectGitHubStep";
import { PickRepositoriesStep } from "./components/PickRepositoriesStep";
import { useStartSetupAgent } from "./hooks/useStartSetupAgent";
import { type EnvironmentProject, projectToLink } from "./utils/projectToLink";

interface CreateEnvironmentFlowProps {
	organizationId: string;
	/** Linked to the new environment when it opens on the project's repository. */
	project?: EnvironmentProject | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onStarted?: () => void;
	setupPrompt?: (environmentUrl: string) => string;
}

export function CreateEnvironmentFlow({
	organizationId,
	project,
	open,
	onOpenChange,
	onStarted,
	setupPrompt = environmentSetupAgentPrompt,
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
	const inFlightRef = useRef(false);
	const create = cloudTrpc.environment.create.useMutation();
	const { start: startSetupAgent, isPending: isLaunching } =
		useStartSetupAgent();

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

	// The dialog stays mounted between opens, so each open starts from the first step.
	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setPicked(null);
			setPickedIds([]);
			setSkippedAccount(false);
		}
		onOpenChange(nextOpen);
	};

	const openGitHubIntegration = () => {
		window.open(`${env.NEXT_PUBLIC_WEB_URL}/integrations/github`, "_blank");
	};

	const getStarted = async (
		repositories: ReadonlyArray<{ id: string; name: string; fullName: string }>,
		primaryId = repositories[0]?.id,
		{ startAgent = true }: { startAgent?: boolean } = {},
	) => {
		const primary = repositories.find(
			(repository) => repository.id === primaryId,
		);
		if (!primary || inFlightRef.current) return;
		inFlightRef.current = true;
		const projectId = projectToLink(project, primary.fullName);
		let environment: Awaited<ReturnType<typeof create.mutateAsync>>;
		try {
			environment = await create.mutateAsync({
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
		} catch (error) {
			inFlightRef.current = false;
			toast.error(errorMessage(error));
			return;
		}
		void utils.environment.list.invalidate();
		void utils.billing.environmentUsage.invalidate();
		const name = environment.name;
		if (!startAgent) {
			inFlightRef.current = false;
			handleOpenChange(false);
			toast.success(t({ message: `Saved ${name}` }));
			return;
		}
		const url = new URL(
			`/environments/${environment.id}`,
			env.NEXT_PUBLIC_WEB_URL,
		).toString();
		try {
			await startSetupAgent({
				organizationId,
				environment,
				prompt: setupPrompt(url),
			});
			handleOpenChange(false);
			onStarted?.();
		} catch (error) {
			// The environment exists either way; closing keeps a retry from making a second one.
			handleOpenChange(false);
			const reason = errorMessage(error);
			toast.error(
				t({
					message: `Saved ${name}, but its setup workspace could not start: ${reason}`,
				}),
				isCloudUsageRefusal(error)
					? {
							action: {
								label: t({ message: "Open billing" }),
								onClick: () => void navigate({ to: "/settings/billing" }),
							},
						}
					: undefined,
			);
		} finally {
			inFlightRef.current = false;
		}
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="flex flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[480px]">
				{needsConnecting ? (
					<ConnectGitHubStep
						accountAvailable={accountAvailable}
						accountLogin={githubUser.data?.connection?.login ?? null}
						appAccountLogin={activeInstallation?.accountLogin ?? null}
						isLoading={isLoading}
						onCancel={() => handleOpenChange(false)}
						onContinue={() => setSkippedAccount(true)}
						onInstallApp={openGitHubIntegration}
					/>
				) : picked ? (
					<ChoosePrimaryStep
						isStarting={create.isPending || isLaunching}
						onBack={() => setPicked(null)}
						onGetStarted={(primaryId) => getStarted(picked, primaryId)}
						onSkip={(primaryId) =>
							getStarted(picked, primaryId, { startAgent: false })
						}
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
							handleOpenChange(false);
							void navigate({ to: "/settings/environments" });
						}}
						onUpgrade={() => {
							handleOpenChange(false);
							void navigate({ to: "/settings/billing/plans" });
						}}
						onCancel={() => handleOpenChange(false)}
						onContinue={(repositories) => {
							setPickedIds(repositories.map((repository) => repository.id));
							if (repositories.length > 1) setPicked(repositories);
							else void getStarted(repositories);
						}}
						onSkip={(repositories) => {
							setPickedIds(repositories.map((repository) => repository.id));
							void getStarted(repositories, undefined, { startAgent: false });
						}}
						organizationId={organizationId}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
