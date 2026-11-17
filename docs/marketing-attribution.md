# Marketing attribution at app identification

Marketing and web share the existing `ph_superset` cookie. In posthog-js
1.310.1, latest campaign/referrer properties use origin-local sessionStorage,
not that cookie. An anonymous website campaign therefore needs an explicit
person update after the app identifies an existing account.

## Behavior

- The shared `marketing_touch` super property holds one complete latest
  qualifying arrival: allowlisted parameters, landing origin/path, external
  referrer origin and ISO timestamp. A tagged arrival or a new document with
  an external non-auth referrer qualifies. Direct, internal and OAuth returns
  do not replace it. Untagged SPA navigation is not a new external arrival.
- Native PostHog first-touch persistence and `$initial_*` properties are left
  intact. The repair never fills missing initial campaign fields on an older
  account. The native initial URL retains its original campaign context;
  this does not introduce new `$initial_utm_id` or first-touch ValueTrack fields.
- Event fields and the explicit person update use the complete retained touch.
  Absent campaign/click fields are null, so the latest campaign cannot retain
  the previous campaign's click ID, keyword or ad group.
- After the existing identity/reset logic runs, the app captures a native
  `$set` event. `before_send` adds the retained person properties. In this SDK,
  passing those values to `identify`, `setPersonProperties` or `capture` before
  `before_send` would also duplicate them in `$stored_person_properties` for
  feature flags. The attribution fields are not used for flag evaluation here.
- Native reset removes the retained touch with the previous identity. Pending
  or failed auth refreshes keep the existing identity behavior. Opt-out skips
  both retention and the explicit update; default tracking behavior is unchanged.

## Parameter inventory

The allowlist covers all native campaign parameters in the pinned SDK,
including Google `gclid`, `gclsrc`, `dclid`, `gbraid`, `wbraid`, and the other
native ad-platform click identifiers. It also extracts existing Ads suffix
fields that were previously available only in captured URLs:

| Field | Existing Ads mapping |
| --- | --- |
| `utm_id` | `{campaignid}` |
| `utm_content` | `{adgroupid}_{creative}` |
| `utm_term` | `{keyword}` |
| `matchtype` | `{matchtype}` |
| `device` | `{device}` |
| `network` | `{network}` |
| `geo` | `{loc_physical_ms}` |
| `assetid` | `{extensionid}` |

This change does not change Ads configuration or conversion definitions.

## Bounds and verification limits

Values are at most 256 characters; a complete URI-encoded touch is at most
1,400 bytes. URL query/hash data is not retained in the new landing/referrer
context. Auth callback and invitation paths are excluded. Cookie capacity is
checked against 3,500 bytes before registration, leaving identity-update room.
Invalid or over-budget new arrivals clear the retained touch rather than
replaying the previous campaign. This is not unlimited URL/cookie storage or
recovery of an already rejected SDK cookie write.

The SDK version, cookie name/backend, project, consent storage and native
identity linking are unchanged. This is same-browser/same-root-domain
continuity, not cross-device or historical backfill. Concurrent already-open
SDK instances can still overwrite shared-cookie state; this repair does not
introduce a custom identity synchronizer or upgrade the SDK.

Unit tests are co-located in `packages/shared/src/marketing-attribution.test.ts`.
The local browser regression uses actual marketing/web instrumentation, the
mounted identifier component and pinned SDK, with fixture auth, locale/Sentry
boundaries and a local collector. Main lacks the explicit latest update; the
repaired path sends it, preserves initial data, replaces campaign IDs, survives
refresh/direct/auth hops and respects reset/opt-out. Local checks do not prove
PostHog production ingestion or deployment. The original real-login defect
receipt remains separate from repaired fixture evidence.

## PostHog references

- https://posthog.com/docs/web-analytics/campaign-attribution-troubleshooting
- https://posthog.com/docs/libraries/js/persistence
- https://posthog.com/docs/product-analytics/person-properties

`cookieWinsOnConflict` and configurable `cookie_persisted_properties` are not
available in this pinned SDK's implementation; current documentation must not
be treated as proof that those options work in 1.310.1.
