import {
	previewUsageReset,
	refreshUsageWidget,
	saveUsageWidgetAppearance,
	saveUsageWidgetPreferences,
	setUsageWidgetAccountHidden,
	showUsageWidget,
	subscribeUsageWidget,
	usageWidgetSnapshot,
} from "main/lib/usage-widget";
import { widgetPreferencesPatchSchema } from "shared/usage-widget/model";
import { z } from "zod";
import { publicProcedure, router } from "../..";
export const createUsageWidgetRouter = () =>
	router({
		onSnapshot: publicProcedure.subscription(() =>
			observable<ReturnType<typeof usageWidgetSnapshot>>((emit) =>
				subscribeUsageWidget((snapshot) => emit.next(snapshot)),
			),
		),
		setAccountAppearance: publicProcedure
			.input(
				z
					.object({
						accountId: z.string().min(1).max(300),
						color: z.string().nullable().optional(),
						label: z.string().nullable().optional(),
					})
					.strict(),
			)
			.mutation(({ input }) => {
				const { accountId, ...appearance } = input;
				return saveUsageWidgetAppearance(accountId, appearance);
			}),
		setAccountHidden: publicProcedure
			.input(
				z.object({
					accountId: z.string().max(300).nullable(),
					hidden: z.boolean(),
				}),
			)
			.mutation(({ input }) =>
				setUsageWidgetAccountHidden(input.accountId, input.hidden),
			),
		previewReset: publicProcedure
			.input(z.enum(["session", "weekly"]))
			.mutation(({ input }) => {
				previewUsageReset(input);
				return { success: true };
			}),
		reloadMetadata: publicProcedure.mutation(async () => {
			await refreshUsageWidget(false);
			return { success: true };
		}),
		get: publicProcedure.query(async () => {
			await refreshUsageWidget();
			return usageWidgetSnapshot();
		}),
		update: publicProcedure
			.input(widgetPreferencesPatchSchema)
			.mutation(({ input }) => saveUsageWidgetPreferences(input)),
		preview: publicProcedure.mutation(() => {
			showUsageWidget();
			return { success: true };
		}),
		refresh: publicProcedure.mutation(async () => {
			await refreshUsageWidget(true);
			return usageWidgetSnapshot();
		}),
	});

import { observable } from "@trpc/server/observable";
