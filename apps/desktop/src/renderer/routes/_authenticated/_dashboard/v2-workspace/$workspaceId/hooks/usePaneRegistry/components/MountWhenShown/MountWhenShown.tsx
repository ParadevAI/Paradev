import type { ReactNode } from "react";
import { useHasScreenBeenShown } from "renderer/lib/screen-active";

export function MountWhenShown({ children }: { children: ReactNode }) {
	return useHasScreenBeenShown() ? children : null;
}
