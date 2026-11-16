import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useMatchRoute } from "renderer/hooks/useMatchRoute";

/** The app-wide top bar is left only on v1 screens; every other screen draws its own headers. */
export function useShowsAppTopBar(): boolean {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const matchRoute = useMatchRoute();
	const onV1Screen =
		matchRoute({ to: "/workspaces", fuzzy: true }) !== false ||
		matchRoute({ to: "/workspace", fuzzy: true }) !== false ||
		matchRoute({ to: "/project/$projectId", fuzzy: true }) !== false;
	return !isV2CloudEnabled || onV1Screen;
}
