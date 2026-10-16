import { z } from "zod";
import { gmailFor, notFound } from "./gmailClient";

/** QStash holds a delayed message for at most a week. */
export const SCHEDULE_DAYS_MAX = 7;

export const scheduledSendSchema = z
	.object({
		organizationId: z.string().uuid(),
		readerId: z.string().uuid(),
		draftId: z.string().regex(/^r-?[0-9]{6,32}$/),
	})
	.strict();
export type ScheduledSend = z.infer<typeof scheduledSendSchema>;

/**
 * Sends the reader's Gmail draft when its time comes. A draft deleted or sent
 * in Gmail meanwhile is gone, and nothing goes out: that is how a scheduled
 * send is cancelled.
 */
export async function sendScheduledDraft(
	job: ScheduledSend,
): Promise<"sent" | "gone"> {
	const { client } = await gmailFor(job.organizationId, job.readerId);
	try {
		await client.users.drafts.send({
			userId: "me",
			requestBody: { id: job.draftId },
		});
		return "sent";
	} catch (error) {
		if (notFound(error)) return "gone";
		throw error;
	}
}
