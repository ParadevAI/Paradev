import { readFile } from "node:fs/promises";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { nativeImage } from "electron";
import { writeClipboardImage } from "main/lib/clipboard-image";
import { screenshotManager } from "main/lib/screenshot-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const DRAG_ICON_HEIGHT = 64;

function requireRow(id: string) {
	const row = screenshotManager.getById(id);
	if (!row) throw new TRPCError({ code: "NOT_FOUND" });
	return row;
}

export const createScreenshotsRouter = () => {
	return router({
		list: publicProcedure.query(() => {
			return screenshotManager.list();
		}),

		onChanged: publicProcedure.subscription(() => {
			return observable<ReturnType<typeof screenshotManager.list>>((emit) => {
				const push = () => emit.next(screenshotManager.list());
				screenshotManager.on("changed", push);
				push();
				return () => {
					screenshotManager.off("changed", push);
				};
			});
		}),

		saveDeviceCapture: publicProcedure
			.input(
				z.object({
					pngBase64: z.string().min(1).max(70_000_000),
					deviceKey: z.string().min(1),
					deviceName: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const image = nativeImage.createFromBuffer(
					Buffer.from(input.pngBase64, "base64"),
				);
				if (image.isEmpty()) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Not a decodable image",
					});
				}
				await writeClipboardImage(image);
				const { id } = screenshotManager.save(image, {
					deviceKey: input.deviceKey,
					deviceName: input.deviceName,
				});
				return { id };
			}),

		onDeviceChanged: publicProcedure
			.input(z.object({ deviceKey: z.string() }))
			.subscription(({ input }) => {
				return observable<ReturnType<typeof screenshotManager.listForDevice>>(
					(emit) => {
						const push = () =>
							emit.next(screenshotManager.listForDevice(input.deviceKey));
						screenshotManager.on("changed", push);
						push();
						return () => {
							screenshotManager.off("changed", push);
						};
					},
				);
			}),

		copy: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const image = nativeImage.createFromPath(requireRow(input.id).savePath);
				if (image.isEmpty()) throw new TRPCError({ code: "NOT_FOUND" });
				await writeClipboardImage(image);
			}),

		readPng: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(async ({ input }) => {
				const row = requireRow(input.id);
				const bytes = await readFile(row.savePath);
				return { filename: row.filename, base64: bytes.toString("base64") };
			}),

		startDrag: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input, ctx }) => {
				const row = requireRow(input.id);
				ctx.senderWindow?.webContents.startDrag({
					file: row.savePath,
					icon: nativeImage
						.createFromDataURL(row.thumbnail)
						.resize({ height: DRAG_ICON_HEIGHT }),
				});
			}),

		clear: publicProcedure.mutation(() => {
			screenshotManager.clear();
			return { success: true };
		}),

		// Resolves the path from the tracked row rather than trusting a
		// renderer-supplied path, matching the downloads router.
		showInFolder: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const row = screenshotManager.getById(input.id);
				if (!row) return { success: false };
				screenshotManager.showInFolder(row.savePath);
				return { success: true };
			}),

		openFile: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const row = screenshotManager.getById(input.id);
				if (!row) return { success: false };
				const error = await screenshotManager.openFile(row.savePath);
				return { success: error === "" };
			}),
	});
};
