import { z } from "zod";
import { queryProcedure, router } from "../../index";
import {
	createLinkPreviewLoader,
	EMPTY_LINK_PREVIEW,
	type LinkPreview,
} from "./fetch-link-preview";
import { LinkPreviewUnavailableError } from "./public-url";

const loadLinkPreview = createLinkPreviewLoader();

/**
 * The renderer's content security policy blocks arbitrary fetches, so the
 * host loads a link's title, description, icon and, when asked, its preview
 * image, behind the guards in `public-url`.
 */
export const linkPreviewRouter = router({
	get: queryProcedure
		.meta({ timeoutMs: 20_000 })
		.input(z.object({ url: z.string(), image: z.boolean().optional() }))
		.query(async ({ input }): Promise<LinkPreview> => {
			try {
				return await loadLinkPreview({
					url: input.url,
					image: input.image ?? false,
				});
			} catch (error) {
				if (error instanceof LinkPreviewUnavailableError) {
					return EMPTY_LINK_PREVIEW;
				}
				throw error;
			}
		}),
});
