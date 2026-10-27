import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { Platform } from "renderer/hotkeys/types";
import type { LinkHoverInfo } from "renderer/lib/terminal/terminal-runtime-registry";

const REVEAL_LABELS: Record<Platform, MessageDescriptor> = {
	mac: msg({ message: "Reveal in Finder" }),
	windows: msg({ message: "Reveal in File Explorer" }),
	linux: msg({ message: "Reveal in File Manager" }),
};

export function revealInFileManagerLabel(
	platform: Platform,
): MessageDescriptor {
	return REVEAL_LABELS[platform];
}

export function revealTarget(
	link: LinkHoverInfo | null | undefined,
): { path: string; isDirectory: boolean } | null {
	if (link?.kind !== "file" || !link.resolvedPath) return null;
	return { path: link.resolvedPath, isDirectory: link.isDirectory };
}
