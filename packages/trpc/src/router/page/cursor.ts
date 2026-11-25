import { z } from "zod";
import { decodeCursor, encodeCursor } from "../../lib/cursor";

export interface PageListKeyset {
	createdAt: string;
	id: string;
}

const POSTGRES_TIMESTAMPTZ_TEXT =
	/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2}(:\d{2})?)?$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `createdAt` is interpolated into the query as `::timestamptz`, so it is
// checked here rather than trusted from whatever the caller echoed back.
const pageListKeysetSchema = z.object({
	createdAt: z.string().regex(POSTGRES_TIMESTAMPTZ_TEXT),
	id: z.string().regex(UUID),
});

export function encodePageCursor(keyset: PageListKeyset): string {
	return encodeCursor({ createdAt: keyset.createdAt, id: keyset.id });
}

export function decodePageCursor(value: string): PageListKeyset | null {
	return decodeCursor(value, pageListKeysetSchema);
}
