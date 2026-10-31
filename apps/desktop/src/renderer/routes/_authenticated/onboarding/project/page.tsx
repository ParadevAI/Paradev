import { useLingui } from "@lingui/react/macro";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import {
	LuFolderOpen,
	LuFolderPlus,
	LuGitBranch,
	LuLayoutTemplate,
} from "react-icons/lu";
import { showStarNagOnboardingToast } from "renderer/components/StarNagToast";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useOpenNewWorkspaceForLocalProject } from "renderer/hooks/useOpenNewWorkspace";
import { track } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	useCreateV1Project,
	useFinalizeProjectSetup,
	useOpenProject,
} from "renderer/react-query/projects";
import { useOpenMainRepoWorkspace } from "renderer/react-query/workspaces";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { EmptyProjectModal } from "renderer/routes/_authenticated/components/EmptyProjectModal";
import { TemplateGalleryModal } from "renderer/routes/_authenticated/components/TemplateGalleryModal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { GhAuthDialog } from "../components/GhAuthDialog";
import { OnboardingTile } from "../components/OnboardingTile";
import { AcquisitionSourceRow } from "./components/AcquisitionSourceRow";
import {
	ACQUISITION_SOURCE_EVENT,
	type AcquisitionSourceAnswer,
	buildAcquisitionSourceProperties,
	EMPTY_ACQUISITION_SOURCE_ANSWER,
} from "./utils/acquisitionSource";

export const Route = createFileRoute("/_authenticated/onboarding/project/")({
	component: OnboardingProjectPage,
});

interface CloneError {
	message: string;
	needsGhAuth: boolean;
}

const GH_AUTH_FAILURE_PATTERNS = [
	"Repository not found",
	"Authentication failed",
	"could not read Username",
];

function toCloneError(err: unknown): CloneError {
	const message = errorMessage(err, "Failed to clone repository");
	const raw = rawErrorMessage(err);
	if (raw.includes("Permission denied (publickey)")) {
		return {
			message:
				"SSH authentication failed — sign in to GitHub CLI and use the HTTPS URL instead.",
			needsGhAuth: true,
		};
	}
	if (GH_AUTH_FAILURE_PATTERNS.some((pattern) => raw.includes(pattern))) {
		return {
			message:
				"Couldn't access this repository — if it's private, sign in to GitHub CLI first.",
			needsGhAuth: true,
		};
	}
	return { message, needsGhAuth: false };
}

function OnboardingProjectPage() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { refetch: refetchSession } = authClient.useSession();
	const { waitForHostReady } = useLocalHostService();
	const openNewWorkspace = useOpenNewWorkspaceForLocalProject();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const cloneTargetDir = homeDir ? `${homeDir}/.superset/projects` : null;
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [cloneError, setCloneError] = useState<CloneError | null>(null);
	const [ghAuthOpen, setGhAuthOpen] = useState(false);
	const [emptyProjectOpen, setEmptyProjectOpen] = useState(false);
	const [templateOpen, setTemplateOpen] = useState(false);
	const [cloneOpen, setCloneOpen] = useState(false);
	const [acquisitionSource, setAcquisitionSource] =
		useState<AcquisitionSourceAnswer>(EMPTY_ACQUISITION_SOURCE_ANSWER);

	const folderImport = useFolderFirstImport({
		onError: (message) => toast.error(message),
	});
	const finalizeSetup = useFinalizeProjectSetup();
	const openProject = useOpenProject();
	const createV1Project = useCreateV1Project();
	const openMainRepoWorkspace = useOpenMainRepoWorkspace();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();

	// Adding a project finishes onboarding: mark onboarded, then hand off to the
	// new-workspace screen with the project just added selected.
	const finish = async (projectId: string) => {
		const acquisitionProperties =
			buildAcquisitionSourceProperties(acquisitionSource);
		if (acquisitionProperties) {
			track(ACQUISITION_SOURCE_EVENT, acquisitionProperties);
		}
		track("onboarding_finished", { outcome: "completed" });
		try {
			await apiTrpcClient.user.completeOnboarding.mutate();
			// Reactive refetch (not imperative getSession) so the layout guards'
			// useSession() sees onboardedAt before we navigate — otherwise the
			// _authenticated guard bounces /new-workspace back to /onboarding.
			await refetchSession({ query: { disableCookieCache: true } });
		} catch (error) {
			console.error("[onboarding] completeOnboarding failed", error);
			toast.error("Could not finish onboarding. Please try again.");
			return;
		}
		// Fires at most once, and only if the user isn't already muted/in
		// cooldown — see useStarNagStore.isEligible().
		showStarNagOnboardingToast();
		if (isV2CloudEnabled) {
			// Straight to the route: a hop through /v2-workspaces lets that page's
			// own mount navigation cancel this one.
			openNewWorkspace(projectId);
			return;
		}
		try {
			await openMainRepoWorkspace.mutateAsync({ projectId });
		} catch (error) {
			console.error("[onboarding] open main workspace failed", error);
			await navigate({ to: "/workspaces", replace: true });
		}
	};

	const handleOpenFolder = async () => {
		if (isV2CloudEnabled) {
			setBusy(true);
			try {
				const result = await folderImport.start();
				if (result) await finish(result.projectId);
			} finally {
				setBusy(false);
			}
			return;
		}
		setBusy(true);
		try {
			const picked = await selectDirectory.mutateAsync({
				title: "Open a folder",
			});
			if (picked.canceled || !picked.path) return;
			const project = await openProject.openFromPath(picked.path);
			if (project) await finish(project.id);
		} catch (err) {
			toast.error(errorMessage(err, "Failed to open folder"));
		} finally {
			setBusy(false);
		}
	};

	const handleClone = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = url.trim();
		if (!trimmed || !cloneTargetDir) return;
		setBusy(true);
		setCloneError(null);
		try {
			if (isV2CloudEnabled) {
				const activeHostUrl = await waitForHostReady();
				if (!activeHostUrl) {
					setCloneError({
						message: "Local host service isn't ready yet. Please try again.",
						needsGhAuth: false,
					});
					return;
				}
				const hostService = getHostServiceClientByUrl(activeHostUrl);
				let created: Awaited<
					ReturnType<typeof hostService.project.create.mutate>
				>;
				try {
					created = await hostService.project.create.mutate({
						name: repoNameFromUrl(trimmed),
						mode: { kind: "clone", parentDir: cloneTargetDir, url: trimmed },
					});
				} catch (err) {
					setCloneError(toCloneError(err));
					return;
				}
				finalizeSetup(activeHostUrl, created);
				await finish(created.projectId);
			} else {
				let projectId: string | null;
				try {
					projectId = await createV1Project.cloneFromUrl({
						url: trimmed,
						parentDir: cloneTargetDir,
					});
				} catch (err) {
					setCloneError(toCloneError(err));
					return;
				}
				if (projectId) await finish(projectId);
			}
		} catch (err) {
			// Non-clone failures (setup, navigation) get the raw message, no gh advice.
			setCloneError({
				message:
					err instanceof Error
						? err.message
						: "Something went wrong. Please try again.",
				needsGhAuth: false,
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<OnboardingTile
					icon={<LuFolderOpen />}
					label={t`Open a folder`}
					onClick={handleOpenFolder}
					disabled={busy}
				/>
				<OnboardingTile
					icon={<LuGitBranch />}
					label={t`Clone a repo`}
					active={cloneOpen}
					onClick={() => setCloneOpen((open) => !open)}
					disabled={busy}
				/>
				<OnboardingTile
					icon={<LuLayoutTemplate />}
					label={t`From a template`}
					onClick={() => setTemplateOpen(true)}
					disabled={busy}
				/>
				<OnboardingTile
					icon={<LuFolderPlus />}
					label={t`Empty project`}
					onClick={() => setEmptyProjectOpen(true)}
					disabled={busy}
				/>
			</div>

			{cloneOpen && (
				<div className="flex flex-col gap-2">
					<form onSubmit={handleClone} className="flex items-center gap-2">
						<Input
							type="text"
							autoFocus
							placeholder="https://github.com/org/repo.git"
							value={url}
							onChange={(e) => {
								setUrl(e.target.value);
								if (cloneError) setCloneError(null);
							}}
							disabled={busy}
							className="flex-1"
						/>
						<Button
							type="submit"
							disabled={!url.trim() || busy || !cloneTargetDir}
						>
							{busy ? t`Cloning…` : t`Clone`}
						</Button>
					</form>
					{cloneError && (
						<div role="alert" className="flex flex-col items-start gap-2">
							<p className="select-text cursor-text break-words text-xs text-destructive">
								{cloneError.message}
							</p>
							{cloneError.needsGhAuth && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setGhAuthOpen(true)}
								>
									Sign in to GitHub CLI
								</Button>
							)}
						</div>
					)}
				</div>
			)}

			<div className="mt-6">
				<AcquisitionSourceRow
					value={acquisitionSource}
					onChange={setAcquisitionSource}
					disabled={busy}
				/>
			</div>

			<TemplateGalleryModal
				open={templateOpen}
				onOpenChange={setTemplateOpen}
				onCreated={(result) => {
					setTemplateOpen(false);
					finish(result.projectId);
				}}
			/>
			<EmptyProjectModal
				open={emptyProjectOpen}
				onOpenChange={setEmptyProjectOpen}
				onSuccess={(result) => {
					setEmptyProjectOpen(false);
					finish(result.projectId);
				}}
			/>
			<GhAuthDialog
				open={ghAuthOpen}
				mode="auth"
				onOpenChange={setGhAuthOpen}
				onExit={() => setGhAuthOpen(false)}
			/>
		</div>
	);
}

function repoNameFromUrl(url: string): string {
	const lastSegment = url
		.trim()
		.replace(/\.git$/, "")
		.replace(/[/:]+$/, "")
		.split(/[/:]/)
		.pop();
	return lastSegment || "repo";
}
