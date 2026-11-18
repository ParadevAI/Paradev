"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import posthog from "posthog-js";
import { useEffect } from "react";

export default function GlobalError({
	error,
}: {
	error: Error & { digest?: string };
}) {
	useEffect(() => {
		Sentry.captureException(error);
		posthog.captureException(error, { digest: error?.digest });
	}, [error]);

	return (
		<html lang="en">
			<body>
				<NextError statusCode={0} />
			</body>
		</html>
	);
}
