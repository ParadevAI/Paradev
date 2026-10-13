import { z } from "zod";
import { queryProcedure, router } from "../../index";
import {
	createLinkPreviewLoader,
	type LinkPreview,
} from "./fetch-link-preview";
import { LinkPreviewUnavailableError } from "./public-url";

const loadLinkPreview = createLinkPreviewLoader();

/**
 * The renderer's content security policy blocks arbitrary fetches, so the
 * host loads a sent link's title and icon, behind the guards in `public-url`.
 */
export const linkPreviewRouter = router({
	get: queryProcedure
		.meta({ timeoutMs: 20_000 })
		.input(z.object({ url: z.string() }))
		.query(async ({ input }): Promise<LinkPreview> => {
			try {
				return await loadLinkPreview(input.url);
			} catch (error) {
				if (error instanceof LinkPreviewUnavailableError) {
					return { title: null, iconDataUrl: null };
				}
				throw error;
			}
		}),
});
