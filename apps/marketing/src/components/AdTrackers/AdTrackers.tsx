"use client";

import Script from "next/script";

import { useCanTrack } from "@/hooks/useCanTrack";
import { REDDIT_PIXEL_ID } from "@/lib/constants";

export function AdTrackers() {
	if (!useCanTrack()) return null;

	return (
		<>
			<Script
				src="https://www.googletagmanager.com/gtag/js?id=AW-18209336001"
				strategy="lazyOnload"
			/>
			<Script id="google-ads-gtag" strategy="lazyOnload">
				{`
					window.dataLayer = window.dataLayer || [];
					function gtag(){dataLayer.push(arguments);}
					gtag('js', new Date());
					gtag('config', 'AW-18209336001');
				`}
			</Script>
			<Script id="reddit-pixel" strategy="lazyOnload">
				{`
					!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js?pixel_id=${REDDIT_PIXEL_ID}",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
					rdt('init','${REDDIT_PIXEL_ID}');
					rdt('track','PageVisit');
				`}
			</Script>
		</>
	);
}
