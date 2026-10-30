import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { eq } from "drizzle-orm";

export async function acpChatEnabled(userId: string): Promise<boolean> {
	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { experimentalChat: true },
	});
	return user?.experimentalChat === true;
}
