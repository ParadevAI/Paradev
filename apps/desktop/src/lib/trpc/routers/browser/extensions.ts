import { observable } from "@trpc/server/observable";
import {
	activateBrowserExtension,
	type BrowserExtension,
	listBrowserExtensions,
	onBrowserExtensionsChanged,
	removeBrowserExtension,
	setBrowserExtensionPinned,
} from "main/lib/browser/extension-host/browser-extensions";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const extensionId = z.string().regex(/^[a-p]{32}$/);

export const createBrowserExtensionsRouter = () => {
	return router({
		// Emits the pane's extensions on subscribe and after every install,
		// removal, pin, badge or popup change.
		watch: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<BrowserExtension[]>((emit) => {
					let latest = 0;
					let disposed = false;
					const push = () => {
						const request = ++latest;
						listBrowserExtensions(input.paneId)
							.then((extensions) => {
								if (!disposed && request === latest) emit.next(extensions);
							})
							.catch((error: unknown) => {
								console.error("[browser-extensions] List failed:", error);
							});
					};
					const unsubscribe = onBrowserExtensionsChanged(push);
					push();
					return () => {
						disposed = true;
						unsubscribe();
					};
				});
			}),

		setPinned: publicProcedure
			.input(z.object({ extensionId, pinned: z.boolean() }))
			.mutation(({ input }) => {
				setBrowserExtensionPinned(input.extensionId, input.pinned);
			}),

		// `anchor` is the clicked control's rect in the calling window, in CSS px.
		activate: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					extensionId,
					anchor: z.object({
						x: z.number(),
						y: z.number(),
						width: z.number(),
						height: z.number(),
					}),
				}),
			)
			.mutation(({ ctx, input }) => {
				const zoom = ctx.senderWindow?.webContents.getZoomFactor() ?? 1;
				const { x, y, width, height } = input.anchor;
				activateBrowserExtension(input.paneId, input.extensionId, {
					x: x * zoom,
					y: y * zoom,
					width: width * zoom,
					height: height * zoom,
				});
			}),

		remove: publicProcedure
			.input(z.object({ extensionId }))
			.mutation(({ input }) => removeBrowserExtension(input.extensionId)),
	});
};
