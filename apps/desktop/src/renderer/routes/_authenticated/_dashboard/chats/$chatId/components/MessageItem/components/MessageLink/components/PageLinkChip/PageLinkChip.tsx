import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuFileText } from "react-icons/lu";
import { DevFace } from "renderer/routes/_authenticated/_dashboard/chats/components/DevFace";
import { usePreview } from "../../../../../../providers/WorkspacePreviewProvider";
import { useMessageAuthorDevId } from "../../../../providers/MessageAuthorDevProvider";

interface PageLinkChipProps {
	slug: string;
	href: string;
	children: ReactNode;
}

/**
 * A link to a page, in the style of a shared file's card: the Dev that
 * linked it and the page's title. Opens the page beside the thread.
 */
export function PageLinkChip({ slug, href, children }: PageLinkChipProps) {
	const navigate = useNavigate();
	const devId = useMessageAuthorDevId();
	const preview = usePreview();
	const linkedByAddress = typeof children === "string" && children === href;
	return (
		<a
			href={href}
			onClick={(event) => {
				event.preventDefault();
				if (preview) preview.openPage(slug);
				else void navigate({ to: "/pages/$slug", params: { slug } });
			}}
			className="my-0.5 inline-flex max-w-full items-center gap-2 rounded-lg bg-background/50 py-1 pr-2.5 pl-1.5 align-middle text-foreground text-sm no-underline transition-colors hover:bg-background/80"
		>
			{devId ? (
				<DevFace devId={devId} size={20} />
			) : (
				<span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground/10">
					<LuFileText className="size-3" aria-hidden="true" />
				</span>
			)}
			<span className="min-w-0 truncate font-medium">
				{linkedByAddress ? slug : children}
			</span>
			{devId && (
				<LuFileText
					className="size-3.5 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
			)}
		</a>
	);
}
