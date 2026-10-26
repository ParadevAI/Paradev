import { observable } from "@trpc/server/observable";
import { hostUsageObservations } from "main/lib/host-usage";
import type { HostUsageObservation } from "shared/host-usage-observation";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createHostUsageRouter = () =>
	router({
		read: publicProcedure
			.input(
				z.object({
					hostUrl: z.string().max(2048),
					forceRefresh: z.boolean().optional(),
				}),
			)
			.query(({ input }) =>
				hostUsageObservations.read(input.hostUrl, input.forceRefresh),
			),
		onObservation: publicProcedure
			.input(z.object({ hostUrl: z.string().max(2048) }))
			.subscription(({ input }) =>
				observable<HostUsageObservation>((emit) => {
					const current = hostUsageObservations.peek(input.hostUrl);
					if (current) emit.next(current);
					return hostUsageObservations.subscribe((value) => {
						if (value.hostUrl === input.hostUrl) emit.next(value);
					});
				}),
			),
	});
