import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { useEffect, useState } from "react";
import { useDesktopNotices } from "renderer/hooks/useDesktopNotices";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";
import { create } from "zustand";
import { resolvePhase, type UpdatePhase } from "./resolvePhase";
import { useAutoUpdateStatus } from "./useAutoUpdateStatus";

export const UPDATE_CONFIRM_MS = 5000;
export const UPDATE_EXIT_MS = 450;

const useInstallingStore = create<{
	isInstalling: boolean;
	setIsInstalling: (isInstalling: boolean) => void;
}>((set) => ({
	isInstalling: false,
	setIsInstalling: (isInstalling) => set({ isInstalling }),
}));

interface UpdateControl {
	/** null while the app is up to date */
	phase: UpdatePhase | null;
	/** The "updated" confirmation is on its way out */
	isLeaving: boolean;
	version: string | undefined;
	percent: number | null;
	error: string | undefined;
	/** Installs when ready, checks again after an error, else does nothing */
	activate: () => void;
	preUpdateConfirm: {
		open: boolean;
		notice: DesktopNotice | null;
		onConfirm: () => void;
		onCancel: () => void;
	};
}

export function useUpdateControl(): UpdateControl {
	const event = useAutoUpdateStatus();
	const { preUpdateNotice } = useDesktopNotices();
	// Shared, so every mounted update control agrees while an install runs.
	const isInstalling = useInstallingStore((s) => s.isInstalling);
	const setIsInstalling = useInstallingStore((s) => s.setIsInstalling);
	const [isConfirming, setIsConfirming] = useState(false);
	const [confirmationDone, setConfirmationDone] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);
	const installMutation = electronTrpc.autoUpdate.install.useMutation();
	const checkMutation = electronTrpc.autoUpdate.check.useMutation();

	const status = event?.status;

	// An install that fails at the IPC layer produces no status event.
	useEffect(() => {
		const hasLeftReady =
			status !== undefined && status !== AUTO_UPDATE_STATUS.READY;
		if (hasLeftReady || installMutation.isError) {
			setIsInstalling(false);
		}
	}, [status, installMutation.isError, setIsInstalling]);

	useEffect(() => {
		if (status !== AUTO_UPDATE_STATUS.UPDATED) {
			setIsLeaving(false);
			return;
		}
		setIsLeaving(false);
		setConfirmationDone(false);
		const leaveTimeout = setTimeout(
			() => setIsLeaving(true),
			UPDATE_CONFIRM_MS,
		);
		const doneTimeout = setTimeout(
			() => setConfirmationDone(true),
			UPDATE_CONFIRM_MS + UPDATE_EXIT_MS,
		);
		return () => {
			clearTimeout(leaveTimeout);
			clearTimeout(doneTimeout);
		};
	}, [status]);

	const phase = resolvePhase(status, isInstalling, confirmationDone);

	const startInstall = () => {
		setIsConfirming(false);
		setIsInstalling(true);
		installMutation.mutate();
	};

	const activate = () => {
		if (phase === "ready") {
			if (preUpdateNotice) {
				setIsConfirming(true);
				return;
			}
			startInstall();
		} else if (phase === "error") {
			checkMutation.mutate();
		}
	};

	return {
		phase,
		isLeaving: phase === "updated" && isLeaving,
		version: event?.version,
		percent: event?.progress?.percent ?? null,
		error: event?.error,
		activate,
		preUpdateConfirm: {
			open: isConfirming,
			notice: preUpdateNotice,
			onConfirm: startInstall,
			onCancel: () => setIsConfirming(false),
		},
	};
}
