#!/usr/bin/env bash
# Creates the standing Autumn coupon rewards and moves SHORTLISTMCR from Stripe to Autumn.
# Needs AUTUMN_SECRET_KEY (live) and a Stripe CLI logged in to the live account.
# Usage: AUTUMN_SECRET_KEY=am_sk_live_... bash scripts/billing/create-autumn-rewards.sh
set -euo pipefail

: "${AUTUMN_SECRET_KEY:?set AUTUMN_SECRET_KEY to the live Autumn secret key}"

SHORTLIST_STRIPE_PROMO="promo_1UVHDI51VNGDWq1Vig2jg49w"

autumn() {
	curl -sS --fail-with-body -X POST "https://api.useautumn.com/v1/$1" \
		-H "Authorization: Bearer $AUTUMN_SECRET_KEY" \
		-H "x-api-version: 2.6.0" \
		-H "Content-Type: application/json" \
		-d "$2" || return
	echo
}

reward_exists() {
	autumn rewards.get "{\"reward_id\":\"$1\"}" >/dev/null 2>&1
}

create_reward() {
	local id="$1" body="$2"
	if reward_exists "$id"; then
		echo "== $id already exists, skipped"
		return
	fi
	echo "== creating $id"
	autumn rewards.create "$body"
}

echo "== checking the Autumn key"
autumn rewards.list '{}' >/dev/null

create_reward yc-bookface-6mo-pro '{"coupon":{
	"id":"yc-bookface-6mo-pro","name":"YC Bookface: 6 months Pro free",
	"type":"percentage_discount","value":100,
	"duration":{"type":"months","length":6},
	"plan_ids":["pro_seat"],"promo_codes":[]}}'

create_reward startup-1-month-free '{"coupon":{
	"id":"startup-1-month-free","name":"Startup 1 month free",
	"type":"percentage_discount","value":100,
	"duration":{"type":"months","length":1},
	"plan_ids":["pro_seat"],"promo_codes":[]}}'

create_reward student-free-pro '{"coupon":{
	"id":"student-free-pro","name":"Student free Pro",
	"type":"percentage_discount","value":100,
	"duration":{"type":"forever","length":null},
	"plan_ids":["pro_seat"],"promo_codes":[]}}'

# Stripe refuses two active promotion codes with the same text, so the
# Stripe-made SHORTLISTMCR is switched off first and switched back on if
# Autumn fails, so the code in the pending email keeps working.
if ! reward_exists shortlist-manchester-2026-1-month; then
	echo "== deactivating Stripe $SHORTLIST_STRIPE_PROMO"
	stripe promotion_codes update "$SHORTLIST_STRIPE_PROMO" -d active=false --live >/dev/null
	echo "== creating shortlist-manchester-2026-1-month"
	if ! autumn rewards.create '{"coupon":{
		"id":"shortlist-manchester-2026-1-month","name":"Shortlist Manchester: 1 month Pro free",
		"type":"percentage_discount","value":100,
		"duration":{"type":"months","length":1},
		"plan_ids":["pro_seat"],
		"promo_codes":[{"code":"SHORTLISTMCR","global_max_redemption":null}]}}'; then
		echo "!! Autumn create failed, reactivating the Stripe code" >&2
		stripe promotion_codes update "$SHORTLIST_STRIPE_PROMO" -d active=true --live >/dev/null
		exit 1
	fi
else
	echo "== shortlist-manchester-2026-1-month already exists, skipped"
fi

echo "== Stripe promotion codes named SHORTLISTMCR (expect one active, made by Autumn)"
stripe promotion_codes list -d code=SHORTLISTMCR --live |
	jq '.data[] | {id, active, coupon: (.promotion.coupon // .coupon.id), times_redeemed}'

echo "== rewards.list (new rewards only)"
autumn rewards.list '{}' | jq '[.coupons[] |
	select(.id | IN("yc-bookface-6mo-pro","startup-1-month-free","student-free-pro","shortlist-manchester-2026-1-month"))]'
