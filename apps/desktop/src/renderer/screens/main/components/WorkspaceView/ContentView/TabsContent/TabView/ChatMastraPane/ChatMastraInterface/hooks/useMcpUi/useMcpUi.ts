import { useCallback, useState } from "react";
import type { McpOverviewPayload } from "../../../../ChatPane/ChatInterface/types";

export interface UseMcpUiOptions {
	cwd: string;
	loadOverview: (cwd: string) => Promise<McpOverviewPayload>;
	onSetErrorMessage: (message: string) => void;
	onClearError: () => void;
}

export interface UseMcpUiReturn {
	overview: McpOverviewPayload | null;
	overviewOpen: boolean;
	isOverviewLoading: boolean;
	showOverview: (overview: McpOverviewPayload) => void;
	setOverviewOpen: (open: boolean) => void;
	openOverview: () => Promise<void>;
	refreshOverview: () => Promise<void>;
	resetUi: () => void;
}

export function useMcpUi({
	cwd,
	loadOverview,
	onSetErrorMessage,
	onClearError,
}: UseMcpUiOptions): UseMcpUiReturn {
	const [overview, setOverview] = useState<McpOverviewPayload | null>(null);
	const [overviewOpen, setOverviewOpen] = useState(false);
	const [isOverviewLoading, setIsOverviewLoading] = useState(false);

	const resetUi = useCallback(() => {
		setOverview(null);
		setOverviewOpen(false);
	}, []);

	const showOverview = useCallback((nextOverview: McpOverviewPayload) => {
		setOverview(nextOverview);
		setOverviewOpen(true);
	}, []);

	const openOverview = useCallback(async () => {
		if (!cwd) {
			onSetErrorMessage("Workspace path is missing");
			return;
		}
		setIsOverviewLoading(true);
		try {
			const nextOverview = await loadOverview(cwd);
			onClearError();
			setOverview(nextOverview);
			setOverviewOpen(true);
		} catch {
			onSetErrorMessage("Failed to load MCP settings");
		} finally {
			setIsOverviewLoading(false);
		}
	}, [cwd, loadOverview, onClearError, onSetErrorMessage]);

	const refreshOverview = useCallback(async () => {
		if (!cwd) return;
		try {
			const nextOverview = await loadOverview(cwd);
			setOverview(nextOverview);
		} catch {
			// Keep existing overview when background refresh fails.
		}
	}, [cwd, loadOverview]);

	return {
		overview,
		overviewOpen,
		isOverviewLoading,
		showOverview,
		setOverviewOpen,
		openOverview,
		refreshOverview,
		resetUi,
	};
}
