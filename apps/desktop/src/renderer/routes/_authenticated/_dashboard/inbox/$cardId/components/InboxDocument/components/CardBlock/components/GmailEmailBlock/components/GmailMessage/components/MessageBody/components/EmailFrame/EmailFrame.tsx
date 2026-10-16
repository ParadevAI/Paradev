import { useEffect, useRef, useState } from "react";

interface EmailFrameProps {
	srcDoc: string;
	title: string;
	/** A `mailto:` link was clicked inside; the app has nowhere to send it, so the card handles it. */
	onMailto?: (href: string) => void;
}

/**
 * An email's HTML in a sandboxed frame: no scripts, no forms, no top-level
 * navigation. Same-origin only so this side can measure its height; with
 * scripts off nothing inside can use that. Links open in a new window, which
 * the app hands to the system browser.
 */
export function EmailFrame({ srcDoc, title, onMailto }: EmailFrameProps) {
	const frame = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(48);
	const mailto = useRef(onMailto);
	mailto.current = onMailto;

	useEffect(() => {
		const element = frame.current;
		if (!element) return;
		let observer: ResizeObserver | null = null;
		const measure = () => {
			const doc = element.contentDocument;
			if (doc?.documentElement)
				setHeight(Math.ceil(doc.documentElement.scrollHeight));
		};
		const onLoad = () => {
			measure();
			const doc = element.contentDocument;
			if (!doc?.body) return;
			observer?.disconnect();
			observer = new ResizeObserver(measure);
			observer.observe(doc.body);
			doc.addEventListener("load", measure, true);
			doc.addEventListener("click", (event) => {
				const link = (event.target as Element | null)?.closest?.("a[href]");
				const href = link?.getAttribute("href") ?? "";
				if (!/^mailto:/i.test(href) || !mailto.current) return;
				event.preventDefault();
				mailto.current(href);
			});
		};
		element.addEventListener("load", onLoad);
		return () => {
			element.removeEventListener("load", onLoad);
			observer?.disconnect();
		};
	}, []);

	return (
		<iframe
			ref={frame}
			title={title}
			srcDoc={srcDoc}
			sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
			referrerPolicy="no-referrer"
			style={{ height }}
			className="block w-full border-0"
		/>
	);
}
