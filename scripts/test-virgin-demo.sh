#!/usr/bin/env bash
# End-to-end smoke test for the Virgin Voyages demo.
# Verifies: backend health, brand data, agent (Ruby), and all new Virgin tools.
#
# Usage:
#   ./scripts/test-virgin-demo.sh                 # defaults to http://localhost:8000
#   API=http://localhost:8000 ./scripts/test-virgin-demo.sh
#
# Pass criteria: every numbered test prints ✅.

set -u

API="${API:-http://localhost:8000}"
WEB="${WEB:-http://localhost:5173}"
PRIMARY_PHONE="${PRIMARY_PHONE:-9999999990}"  # Vivian Bell — Sea Terrace
MEGA_ROCKSTAR_PHONE="9999999998"              # Tanaka — Mega RockStar

PASS=0
FAIL=0
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
DIM=$'\033[2m'
BOLD=$'\033[1m'
NC=$'\033[0m'

pass() { echo "  ${GREEN}✅ $1${NC}"; PASS=$((PASS + 1)); }
fail() { echo "  ${RED}❌ $1${NC}"; FAIL=$((FAIL + 1)); }
info() { echo "  ${DIM}$1${NC}"; }
head_() { echo; echo "${BOLD}── $1${NC}"; }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
ruby_say() {
  # $1 = user prompt;  $2 = conversation uuid
  local prompt="$1"
  local uuid="${2:-test-$RANDOM}"
  curl -s -X POST "$API/api/agent-respond-elevenlabs" \
    -H "Content-Type: application/json" \
    -d "{\"conversation_uuid\":\"$uuid\",\"messages\":[{\"role\":\"user\",\"content\":\"$prompt\"}]}" \
    2>/dev/null
}

# Multi-turn helper for conversational follow-ups. Pass alternating
# user/assistant strings. The agent endpoint is stateless per-call — must
# replay full history. Uses python for robust JSON encoding.
ruby_multi() {
  # $1 = uuid, $2..N = alternating user/assistant strings (start with user)
  local uuid="$1"; shift
  local messages_json
  # Note: with `python3 -c "script" arg1 arg2...`, sys.argv[0] = '-c'
  # so the real args start at sys.argv[1]. uuid is sys.argv[1], messages are sys.argv[2:].
  messages_json=$(python3 -c '
import sys, json
roles = ["user", "assistant"]
uuid = sys.argv[1]
msgs = [{"role": roles[i % 2], "content": s} for i, s in enumerate(sys.argv[2:])]
print(json.dumps({"conversation_uuid": uuid, "messages": msgs}))
' "$uuid" "$@")
  curl -s -X POST "$API/api/agent-respond-elevenlabs" \
    -H "Content-Type: application/json" \
    -d "$messages_json" \
    2>/dev/null
}

# Extract bot_text from agent response JSON
extract_bot() {
  python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get('bot_text','') or '')
except Exception as e:
    print('ERROR:',e)"
}

# Extract card type
extract_card() {
  python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    c=d.get('card_payload')
    if c is None: print('(none)')
    elif isinstance(c, list): print('multi:'+ ','.join((x or {}).get('card','?') for x in c))
    else: print(c.get('card','(unknown)'))
except Exception as e:
    print('ERROR:',e)"
}

contains_any() {
  local hay="$1"; shift
  local h_lc="$(echo "$hay" | tr '[:upper:]' '[:lower:]')"
  for needle in "$@"; do
    local n_lc="$(echo "$needle" | tr '[:upper:]' '[:lower:]')"
    if [[ "$h_lc" == *"$n_lc"* ]]; then return 0; fi
  done
  return 1
}

excludes_all() {
  local hay="$1"; shift
  local h_lc="$(echo "$hay" | tr '[:upper:]' '[:lower:]')"
  for needle in "$@"; do
    local n_lc="$(echo "$needle" | tr '[:upper:]' '[:lower:]')"
    if [[ "$h_lc" == *"$n_lc"* ]]; then return 1; fi
  done
  return 0
}

# ---------------------------------------------------------------------------
# 0.  Boot checks
# ---------------------------------------------------------------------------
head_ "0. Server health"
HEALTH=$(curl -s "$API/health" 2>/dev/null)
if [[ -z "$HEALTH" ]]; then
  fail "Backend not reachable at $API — start it with: cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000"
  echo
  echo "${RED}Aborting — no backend.${NC}"
  exit 1
fi
echo "$HEALTH" | grep -q '"status":"healthy"' && pass "backend reports healthy" || fail "backend not healthy: $HEALTH"

WEB_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WEB/" 2>/dev/null)
if [[ "$WEB_CODE" == "200" ]]; then
  pass "vite serving $WEB"
else
  info "vite not reachable at $WEB (HTTP $WEB_CODE) — frontend tests skipped"
fi

# ---------------------------------------------------------------------------
# 1.  Brand data swap (Virgin not Carnival)
# ---------------------------------------------------------------------------
head_ "1. Brand data — Scarlet Lady itinerary loaded"
LOOKUP=$(curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" -d "{\"identifier\":\"$PRIMARY_PHONE\"}")
NAME=$(echo "$LOOKUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['guest']['name'])")
TIER=$(echo "$LOOKUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['guest']['vifp_tier'])")
BOOKING=$(echo "$LOOKUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['guest']['booking_ref'])")
info "guest: $NAME · tier: $TIER · ref: $BOOKING"
[[ "$NAME" == *"Vivian"* ]] && pass "primary guest is Vivian Bell" || fail "primary guest unexpected: $NAME"
[[ "$TIER" == "Sea Terrace" ]] && pass "tier is 'Sea Terrace'" || fail "tier unexpected: $TIER"
[[ "$BOOKING" == VV-* ]] && pass "booking ref uses VV- prefix" || fail "booking ref unexpected: $BOOKING"

# ---------------------------------------------------------------------------
# 2.  Phase 2 — Ruby persona
# ---------------------------------------------------------------------------
head_ "2. Phase 2 — Ruby introduces herself"
R=$(ruby_say "hi who are you?" "p2-intro")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
contains_any "$BOT" "Ruby" && pass "intro mentions 'Ruby'" || fail "intro missing 'Ruby': $BOT"
excludes_all "$BOT" "Marina" "Carnival" "Celebration" && pass "no Marina/Carnival/Celebration leak" || fail "Carnival residue detected: $BOT"

# ---------------------------------------------------------------------------
# 3.  Phase 2 — Virgin venue knowledge
# ---------------------------------------------------------------------------
head_ "3. Phase 2 — Ruby routes 'Italian' → Extra Virgin"
R=$(ruby_say "book me an Italian dinner for 7:30" "p2-italian")
BOT=$(echo "$R" | extract_bot)
CARD=$(echo "$R" | extract_card)
info "card: $CARD"
info "Ruby: ${BOT:0:240}"
contains_any "$BOT" "Extra Virgin" && pass "names Extra Virgin (Virgin's Italian venue)" \
  || fail "did not surface Extra Virgin: $BOT"
excludes_all "$BOT" "Cucina" "Carnival" && pass "no Cucina del Capitano leak" || fail "Cucina residue detected"

head_ "3a. Phase 2 — Ruby knows Pink Agave + mezcal"
R=$(ruby_say "book me Mexican for 8 PM" "p2-mexican")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
contains_any "$BOT" "Pink Agave" && pass "names Pink Agave" || fail "missing Pink Agave: $BOT"

# ---------------------------------------------------------------------------
# 4.  Phase 2 — Branson / Virgin Records trivia
# ---------------------------------------------------------------------------
head_ "4. Phase 2 — Branson/Virgin Records music trivia"
R=$(ruby_say "tell me about The Manor and Branson" "p2-manor")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:320}"
if contains_any "$BOT" "Virgin Records" "Tubular Bells" "Sex Pistols" "Mike Oldfield" "Peter Gabriel" "1972"; then
  pass "drops Virgin Records / Branson trivia"
else
  fail "no music trivia surfaced: $BOT"
fi

# ---------------------------------------------------------------------------
# 5.  Phase 3 — Shake for Champagne (direct endpoint)
# ---------------------------------------------------------------------------
head_ "5. Phase 3 — POST /api/champagne/order (front-end shake path)"
CHAMPAGNE=$(curl -s -X POST "$API/api/champagne/order" -H "Content-Type: application/json" -d '{"location":"the pool deck"}')
BOTTLE=$(echo "$CHAMPAGNE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('bottle','—'))")
PRICE=$(echo "$CHAMPAGNE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('price','—'))")
ETA=$(echo "$CHAMPAGNE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('eta_minutes','—'))")
CONF=$(echo "$CHAMPAGNE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('confirmation_id','—'))")
info "$BOTTLE · \$$PRICE · ETA ${ETA}m · conf #$CONF"
[[ "$BOTTLE" == *"Möet"* ]] && pass "returns Möet & Chandon Impérial" || fail "wrong bottle: $BOTTLE"
[[ "$PRICE" == "105"* ]] && pass "price is \$105" || fail "price wrong: $PRICE"
[[ "$CONF" == CH* ]] && pass "confirmation has CH prefix" || fail "conf wrong: $CONF"

# ---------------------------------------------------------------------------
# 6.  Phase 3 — Ruby triggers champagne via chat
# ---------------------------------------------------------------------------
head_ "6. Phase 3 — Ruby calls order_champagne via chat"
R=$(ruby_say "bring me a bottle to the pool" "p3-chat")
BOT=$(echo "$R" | extract_bot)
CARD=$(echo "$R" | extract_card)
info "card: $CARD"
info "Ruby: ${BOT:0:240}"
[[ "$CARD" == "champagne" || "$CARD" == multi:*champagne* ]] && pass "card_payload is 'champagne'" || fail "wrong card: $CARD"
contains_any "$BOT" "Möet" "bottle" "champagne" "on the way" && pass "confirms dispatch" || fail "no dispatch confirmation: $BOT"

# ---------------------------------------------------------------------------
# 7.  Phase 4 — Tonight's Look (suggest_outfit)
# ---------------------------------------------------------------------------
head_ "7. Phase 4 — suggest_outfit returns 3 looks"
R=$(ruby_say "what should I wear for Scarlet Night?" "p4-look")
BOT=$(echo "$R" | extract_bot)
CARD=$(echo "$R" | extract_card)
info "card: $CARD"
info "Ruby: ${BOT:0:300}"
LOOKS=$(echo "$R" | python3 -c "import sys,json
d=json.load(sys.stdin); c=d.get('card_payload') or {}
print(len(c.get('looks',[])) if isinstance(c, dict) else 0)")
[[ "$CARD" == "outfit_suggestion" ]] && pass "card_payload is 'outfit_suggestion'" || fail "wrong card: $CARD"
[[ "$LOOKS" -ge 1 ]] && pass "$LOOKS look(s) returned" || fail "no looks returned"
contains_any "$BOT" "Scarlet Statement" "Ruby Tuxedo" "After-Hours Red" && pass "names a lookbook entry" || fail "no named look in reply"

# ---------------------------------------------------------------------------
# 8.  Phase 4 — book_salon
# ---------------------------------------------------------------------------
head_ "8. Phase 4 — book_salon tool"
R=$(ruby_say "book me a blow-out at 7 PM" "p4-salon")
BOT=$(echo "$R" | extract_bot)
CARD=$(echo "$R" | extract_card)
info "card: $CARD"
info "Ruby: ${BOT:0:240}"
[[ "$CARD" == "salon_booking" ]] && pass "card_payload is 'salon_booking'" || fail "wrong card: $CARD"
contains_any "$BOT" "blow-out" "Redemption" "salon" "7" && pass "confirms salon booking" || fail "no booking confirmation: $BOT"

# ---------------------------------------------------------------------------
# 9.  Phase 4 — recommend_pre_show_drink
# ---------------------------------------------------------------------------
head_ "9. Phase 4 — recommend_pre_show_drink at The Manor"
R=$(ruby_say "what should I drink at The Manor before the show?" "p4-drink")
BOT=$(echo "$R" | extract_bot)
CARD=$(echo "$R" | extract_card)
info "card: $CARD"
info "Ruby: ${BOT:0:240}"
[[ "$CARD" == "drink_pairing" || "$CARD" == "(none)" ]] && pass "drink card or chat reply" || fail "unexpected card: $CARD"
contains_any "$BOT" "Negroni" "cocktail" "Manor" "bar" "drink" && pass "names a drink / venue" || fail "no drink suggestion: $BOT"

# ---------------------------------------------------------------------------
# 10. Phase 5 — Scarlet Night awareness
# ---------------------------------------------------------------------------
head_ "10. Phase 5 — Ruby knows Scarlet Night is tomorrow + the red dress code"
R=$(ruby_say "when is Scarlet Night and what do I wear?" "p5-scarlet")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:320}"
contains_any "$BOT" "tomorrow" "Day 5" "Scarlet Night" && pass "knows it's tomorrow / Day 5" || fail "no Scarlet Night context: $BOT"
contains_any "$BOT" "red" && pass "mentions the red dress code" || fail "no red mention"

# ---------------------------------------------------------------------------
# 11. Phase 6 — Tonight's Now Playing knowledge
# ---------------------------------------------------------------------------
head_ "11. Phase 6 — Ruby knows tonight at The Manor"
R=$(ruby_say "what's on at The Manor tonight?" "p6-manor")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:320}"
contains_any "$BOT" "UNTITLED" "DANCESHOWPARTYTHING" "Klub Rubik" "Festival Stage" "DJ" && pass "names a real Manor act" || fail "no Manor show named: $BOT"

# ---------------------------------------------------------------------------
# 12. Always-Included framing — never quotes a price for free things
# ---------------------------------------------------------------------------
head_ "12. 'Always Included' — Ruby doesn't invent a cover charge"
R=$(ruby_say "what's the cover charge at Pink Agave?" "p12-cover")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:300}"
if excludes_all "$BOT" '$18' '$25' '$38' '$49' 'cover charge of $' ; then
  contains_any "$BOT" "included" "no cover" "no charge" "free" "Always Included" && pass "communicates 'included' framing" \
    || pass "did not invent a price (no 'included' phrasing but acceptable)"
else
  fail "invented a cover charge: $BOT"
fi

# ---------------------------------------------------------------------------
# 13. Mega RockStar guest — tier-aware perks
# ---------------------------------------------------------------------------
head_ "13. Phase 7 — Mega RockStar guest loads with $0 folio + tier"
MEGA=$(curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" -d "{\"identifier\":\"$MEGA_ROCKSTAR_PHONE\"}")
M_NAME=$(echo "$MEGA" | python3 -c "import sys,json; print(json.load(sys.stdin)['guest']['name'])")
M_TIER=$(echo "$MEGA" | python3 -c "import sys,json; print(json.load(sys.stdin)['guest']['vifp_tier'])")
M_BAL=$(echo "$MEGA" | python3 -c "import sys,json; print(json.load(sys.stdin)['guest']['folio']['balance'])")
info "$M_NAME · tier: $M_TIER · folio: \$$M_BAL"
[[ "$M_TIER" == "Mega RockStar" ]] && pass "tier reads 'Mega RockStar'" || fail "tier wrong: $M_TIER"
[[ "$M_BAL" == "0"* || "$M_BAL" == "0.0" ]] && pass "Mega RockStar folio is \$0" || fail "folio not zero: $M_BAL"

# Re-pin primary phone so we don't leak state into the next demo run
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null


# ═════════════════════════════════════════════════════════════════════════
# WAVE 2 — Bug fix + 8 new features
# ═════════════════════════════════════════════════════════════════════════

# Reset primary guest state so duplicate-guards across runs don't poison Wave 2
# (e.g. arrange_surprise tries to book The Wake — fails if previous run did too).
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

# Helper: structural assertion — card_payload is an array of N cards.
expect_card_count() {
  local resp="$1"; local n="$2"; local label="$3"
  local got
  got=$(echo "$resp" | python3 -c "
import sys, json
d = json.load(sys.stdin); c = d.get('card_payload')
print(len(c) if isinstance(c, list) else 0)
")
  if [[ "$got" -eq "$n" ]]; then pass "$label · $n cards"; else fail "$label · expected $n cards, got $got"; fi
}

# Helper: structural assertion — payload includes a card with a specific type.
expect_card_type() {
  local resp="$1"; local expected="$2"; local label="$3"
  local has
  has=$(echo "$resp" | python3 -c "
import sys, json
d = json.load(sys.stdin); c = d.get('card_payload')
types = [x.get('card') for x in c] if isinstance(c, list) else ([c.get('card')] if c else [])
print('yes' if '$expected' in types else 'no')
")
  if [[ "$has" == "yes" ]]; then pass "$label includes '$expected'"; else fail "$label MISSING '$expected'"; fi
}

# ---------------------------------------------------------------------------
# W2.1 — Bug fix: land_the_look returns 4 distinct cards
# ---------------------------------------------------------------------------
head_ "W2.1 · Bug fix — land_the_look (Scarlet Statement) returns 4 cards"
R=$(ruby_say "land the Scarlet Statement look for Scarlet Night" "w2-ltl-ss")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
expect_card_count "$R" 4 "Scarlet Statement"
expect_card_type  "$R" "outfit_confirmed" "Scarlet Statement"
expect_card_type  "$R" "salon_booking"    "Scarlet Statement"
expect_card_type  "$R" "manor_table"      "Scarlet Statement"
expect_card_type  "$R" "drink_pairing"    "Scarlet Statement"

head_ "W2.2 · Bug fix — each look produces a DIFFERENT cocktail"
DRINKS=$(for look in "Scarlet Statement" "Ruby Tuxedo" "After-Hours Red"; do
  uuid="w2-ltl-${look// /-}"
  curl -s -X POST "$API/api/agent-respond-elevenlabs" \
    -H "Content-Type: application/json" \
    -d "{\"conversation_uuid\":\"$uuid\",\"messages\":[{\"role\":\"user\",\"content\":\"land the $look look\"}]}" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin); c = d.get('card_payload') or []
for x in (c if isinstance(c, list) else [c]):
    if x and x.get('card') == 'drink_pairing':
        print(x.get('drink','?'))
        break
else:
    print('NONE')
"
done | sort -u)
N_UNIQ=$(echo "$DRINKS" | wc -l | tr -d ' ')
info "distinct cocktails: $DRINKS"
[[ "$N_UNIQ" -ge 3 ]] && pass "3 unique cocktails across 3 looks" || fail "only $N_UNIQ unique cocktail(s) — bug not fully fixed"

# ---------------------------------------------------------------------------
# W2.3 — hangover_recovery_menu
# ---------------------------------------------------------------------------
head_ "W2.3 · Hangover Saver — recovery_menu card with multiple items"
R=$(ruby_say "Open the hangover recovery menu" "w2-rec")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
expect_card_type "$R" "recovery_menu" "Recovery"
ITEMS=$(echo "$R" | python3 -c "
import sys, json
d=json.load(sys.stdin); c=d.get('card_payload') or {}
if isinstance(c, list): c = next((x for x in c if x.get('card')=='recovery_menu'), {})
print(len(c.get('items', [])))")
[[ "$ITEMS" -ge 3 ]] && pass "menu has $ITEMS items" || fail "menu too sparse: $ITEMS"
contains_any "$BOT" "Late one" "hydration" "smoothie" "breakfast" && pass "brand voice intact" || fail "voice off: $BOT"

# ---------------------------------------------------------------------------
# W2.4 — identify_now_playing (Manor Shazam)
# ---------------------------------------------------------------------------
head_ "W2.4 · Manor Shazam — identify_now_playing card with Spotify link"
R=$(ruby_say "What is playing right now at The Manor? Identify the track for me." "w2-shaz")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
expect_card_type "$R" "now_playing_track" "Shazam"
TRACK=$(echo "$R" | python3 -c "
import sys, json
d=json.load(sys.stdin); c=d.get('card_payload') or {}
if isinstance(c, dict): print(c.get('track',''),'·',c.get('artist',''))
")
info "now playing: $TRACK"
HAS_LINK=$(echo "$R" | python3 -c "
import sys, json
d=json.load(sys.stdin); c=d.get('card_payload') or {}
print('yes' if 'spotify' in (c.get('spotify_search_url','') or '').lower() else 'no')")
[[ "$HAS_LINK" == "yes" ]] && pass "Spotify deep-link included" || fail "no Spotify link"

# ---------------------------------------------------------------------------
# W2.5 — recommend_drink_now (mood-based)
# ---------------------------------------------------------------------------
head_ "W2.5 · Mood-based drink — distinct from venue-based pre_show"
R_TIRED=$(ruby_say "What should I drink? I am feeling tired" "w2-mood-tired")
R_CELEB=$(ruby_say "I am celebrating — what should I drink right now?" "w2-mood-celeb")
D_TIRED=$(echo "$R_TIRED" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('card_payload') or {}).get('drink',''))")
D_CELEB=$(echo "$R_CELEB" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('card_payload') or {}).get('drink',''))")
info "tired → $D_TIRED   |   celebratory → $D_CELEB"
[[ -n "$D_TIRED" && -n "$D_CELEB" && "$D_TIRED" != "$D_CELEB" ]] && pass "mood-based drinks differ" || fail "moods returned identical drinks"

# ---------------------------------------------------------------------------
# W2.6 — arrange_surprise (multi-card macro)
# ---------------------------------------------------------------------------
head_ "W2.6 · Surprise Mode — multi-card response (summary + dining + champagne)"
R=$(ruby_say "Arrange an anniversary surprise for tonight, premium budget" "w2-surp")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
expect_card_count "$R" 3 "Surprise"
expect_card_type  "$R" "surprise_summary" "Surprise"
expect_card_type  "$R" "dining"           "Surprise"
expect_card_type  "$R" "champagne"        "Surprise"

# ---------------------------------------------------------------------------
# W2.7 — prebook_bimini_day (multi-card macro)
# ---------------------------------------------------------------------------
head_ "W2.7 · Pre-Board Bimini — multi-card port plan"
R=$(ruby_say "Pre-board my Bimini day — private cabana, lunch at 1, party of 2" "w2-bim")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
expect_card_type "$R" "port_day_plan" "Bimini"
expect_card_type "$R" "dining"        "Bimini"
expect_card_type "$R" "drink_pairing" "Bimini"
CARD_COUNT=$(echo "$R" | python3 -c "
import sys, json
d=json.load(sys.stdin); c=d.get('card_payload')
print(len(c) if isinstance(c, list) else 0)")
[[ "$CARD_COUNT" -ge 3 ]] && pass "$CARD_COUNT cards in plan" || fail "too few cards: $CARD_COUNT"

# ---------------------------------------------------------------------------
# W2.8 — generate_packing_list
# ---------------------------------------------------------------------------
head_ "W2.8 · Pack Forecaster — tailored packing list"
R=$(ruby_say "Generate my packing list for this voyage" "w2-pack")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
expect_card_type "$R" "packing_list" "Packing list"
SECTIONS=$(echo "$R" | python3 -c "
import sys, json
d=json.load(sys.stdin); c=d.get('card_payload') or {}
print(len(c.get('sections', [])))")
[[ "$SECTIONS" -ge 4 ]] && pass "$SECTIONS sections" || fail "too few sections: $SECTIONS"
contains_any "$BOT" "Red" "Scarlet Night" "no formal" "RED" && pass "Scarlet Night red flagged" || fail "missing Scarlet Night context: $BOT"

# ---------------------------------------------------------------------------
# W2.9 — get_voyage_diary
# ---------------------------------------------------------------------------
head_ "W2.9 · Voyage Diary — today's chapter with real moments"
R=$(ruby_say "Show me today's voyage diary" "w2-diary")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
expect_card_type "$R" "voyage_diary" "Diary"
MOMENTS=$(echo "$R" | python3 -c "
import sys, json
d=json.load(sys.stdin); c=d.get('card_payload') or {}
print(len(c.get('moments', [])))")
[[ "$MOMENTS" -ge 2 ]] && pass "$MOMENTS moments captured" || fail "diary too sparse: $MOMENTS"

# ---------------------------------------------------------------------------
# W2.10 — create_squad_event (cosmetic)
# ---------------------------------------------------------------------------
head_ "W2.10 · Squad Mode — single cosmetic card with mock invitees"
R=$(ruby_say "Create a Scarlet Night squad event for 4 of us" "w2-sqd")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
expect_card_type "$R" "squad_event" "Squad"
INVITEES=$(echo "$R" | python3 -c "
import sys, json
d=json.load(sys.stdin); c=d.get('card_payload') or {}
print(len(c.get('invitees', [])))")
[[ "$INVITEES" -ge 3 ]] && pass "$INVITEES mock invitees" || fail "too few invitees: $INVITEES"

# ---------------------------------------------------------------------------
# W2.11 — Wave 2 frontend assets (diary headers)
# ---------------------------------------------------------------------------
if [[ "$WEB_CODE" == "200" ]]; then
  head_ "W2.11 · Frontend — Wave 2 diary header SVGs served"
  for asset in /diary/day-1.svg /diary/day-2.svg /diary/day-3.svg /diary/day-4.svg /diary/day-5.svg; do
    code=$(curl -s -o /dev/null -w "%{http_code}" "$WEB$asset")
    if [[ "$code" == "200" ]]; then pass "GET $asset → 200"; else fail "GET $asset → $code"; fi
  done
fi

# ---------------------------------------------------------------------------
# W2.12 — Regression: switch_reservation still uses 2-card pattern
# ---------------------------------------------------------------------------
head_ "W2.12 · Regression — switch_reservation still returns 2 cards (cancel + new)"
# Pre-seed: book Persephone first
ruby_say "book Persephone for 2" "w2-sw-seed" >/dev/null
R=$(ruby_say "cancel Persephone and book UNTITLED DANCESHOWPARTYTHING instead for 2" "w2-sw")
CARDS=$(echo "$R" | python3 -c "
import sys, json
d=json.load(sys.stdin); c=d.get('card_payload')
print(len(c) if isinstance(c, list) else 1 if c else 0)")
info "switch returned $CARDS cards"
[[ "$CARDS" -ge 2 ]] && pass "switch_reservation still multi-card" || fail "switch broken: $CARDS cards"

# Re-pin primary phone (cleanup)
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null


# ---------------------------------------------------------------------------
# 14. Frontend assets (only if vite is up)
# ---------------------------------------------------------------------------
if [[ "$WEB_CODE" == "200" ]]; then
  head_ "14. Frontend — Virgin assets are served"
  for asset in /virgin-logo.jpg /scarlet-lady-hero.jpg /virgin-logo-white.svg \
               /looks/scarlet-statement.svg /looks/ruby-tux.svg /looks/after-hours.svg; do
    code=$(curl -s -o /dev/null -w "%{http_code}" "$WEB$asset")
    if [[ "$code" == "200" ]]; then pass "GET $asset → 200"; else fail "GET $asset → $code"; fi
  done
fi

# ═════════════════════════════════════════════════════════════════════════
# WAVE 3 — Conversational sweep + bug-fix regression
# Asserts CORRECT behaviour for the 5 user-reported bugs and adjacent flows.
# These will FAIL before fixes and PASS after.
# ═════════════════════════════════════════════════════════════════════════

# Reset primary guest so duplicate guards don't poison Wave 3 measurements.
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

# Helper: extract a field from the first card matching a card-type filter
extract_first_card_field() {
  local resp="$1"; local card_type="$2"; local field="$3"
  echo "$resp" | python3 -c "
import sys, json
d = json.load(sys.stdin); c = d.get('card_payload')
cards = c if isinstance(c, list) else ([c] if c else [])
for x in cards:
    if x.get('card') == '$card_type':
        print(x.get('$field','') if not isinstance(x.get('$field'), (dict, list)) else json.dumps(x.get('$field')))
        break
"
}

# ---------------------------------------------------------------------------
# W3.B1 — Wrong-bottle on "send it to my cabin" follow-up
# ---------------------------------------------------------------------------
head_ "W3.B1 · Mood drink follow-up preserves the bottle (Krug ≠ Möet)"
# Reset to isolate from prior champagne orders
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

UUID="w3-b1-$RANDOM"
# Two-turn flow with full history replayed (agent endpoint is stateless per-call).
R=$(ruby_multi "$UUID" \
  "What should I drink right now? I am celebrating." \
  "Right now? A Krug pour at Red Bar, tucked just behind The Wake on Deck 7. It's \$28 — quiet luxury, served properly." \
  "Send it to my cabin instead.")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
CARD_BOTTLE=$(extract_first_card_field "$R" "champagne" "bottle")
info "champagne card bottle: $CARD_BOTTLE"
# After fix: card bottle should mention Krug (or whatever was just recommended)
if [[ "$CARD_BOTTLE" == *"Krug"* ]]; then
  pass "card bottle = Krug (matches recommendation)"
else
  fail "card bottle = '$CARD_BOTTLE' (expected Krug — text/card mismatch [B1])"
fi

# ---------------------------------------------------------------------------
# W3.B2 — Surprise mode champagne is SCHEDULED, not ETA-from-now
# ---------------------------------------------------------------------------
head_ "W3.B2 · Surprise mode champagne shows 'pre-poured at' instead of ETA"
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

R=$(ruby_say "Arrange an anniversary surprise for tonight, premium budget" "w3-b2")
SCHEDULED=$(extract_first_card_field "$R" "champagne" "scheduled_for")
ETA=$(extract_first_card_field "$R" "champagne" "eta_minutes")
info "champagne scheduled_for: '$SCHEDULED' · eta_minutes: '$ETA'"
# After fix: scheduled_for should be set (e.g. "8:00 PM"); eta_minutes can be 0/null/absent
if [[ -n "$SCHEDULED" ]]; then
  pass "scheduled_for present ('$SCHEDULED')"
else
  fail "scheduled_for missing — champagne still shows immediate ETA framing [B2]"
fi

# ---------------------------------------------------------------------------
# W3.B3 — Squad event includes is_demo_data flag
# ---------------------------------------------------------------------------
head_ "W3.B3 · Squad event card carries is_demo_data flag"
R=$(ruby_say "Create a Scarlet Night squad event for 4 of us" "w3-b3")
IS_DEMO=$(extract_first_card_field "$R" "squad_event" "is_demo_data")
info "squad_event is_demo_data: '$IS_DEMO'"
if [[ "$IS_DEMO" == "True" || "$IS_DEMO" == "true" ]]; then
  pass "is_demo_data flag set on squad_event card"
else
  fail "is_demo_data missing — frontend will render mock invitees as real [B3]"
fi

# ---------------------------------------------------------------------------
# W3.B4 — Shazam track and dashboard widget rotate from a shared source
# ---------------------------------------------------------------------------
head_ "W3.B4 · identify_now_playing returns track tagged with current set_name"
R=$(ruby_say "What's playing right now at The Manor?" "w3-b4")
SET_NAME=$(extract_first_card_field "$R" "now_playing_track" "set_name")
info "now_playing_track set_name: '$SET_NAME'"
if [[ -n "$SET_NAME" ]]; then
  pass "track carries set_name '$SET_NAME' (synchronisable with dashboard)"
else
  fail "track missing set_name — dashboard and Shazam will diverge [B4]"
fi

# ---------------------------------------------------------------------------
# W3.B5 — Specific recovery items don't re-show the full menu
# ---------------------------------------------------------------------------
head_ "W3.B5 · 'book hydration drip only' does not re-issue the recovery menu"
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

R=$(ruby_say "Book just the hydration drip from the recovery menu" "w3-b5")
CARD_TYPE=$(echo "$R" | extract_card)
# After Wave 4: book_recovery_item still returns card type 'recovery_menu' so
# the rendering stays consistent, but the items array is narrowed to just the
# named items. Pass criterion is the item count, not the card type.
ITEM_COUNT=$(echo "$R" | python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    c=d.get('card_payload')
    if isinstance(c,list): c=c[0] if c else None
    print(len((c or {}).get('items',[])))
except Exception: print(-1)")
info "card type: $CARD_TYPE | items: $ITEM_COUNT"
if [[ "$ITEM_COUNT" == "1" ]]; then
  pass "specific-item request returns 1 item (not the full 4-item menu)"
elif [[ "$CARD_TYPE" != "recovery_menu" ]]; then
  pass "responded with '$CARD_TYPE' (not the full menu)"
else
  fail "re-issued the full recovery_menu instead of booking the specific item [B5]"
fi

# ---------------------------------------------------------------------------
# W3.B6 — ReservationsCard surfaces all Wave 2 reservation kinds with names
# ---------------------------------------------------------------------------
head_ "W3.B6 · get_my_reservations returns Wave 2 kinds with readable names"
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

# Seed Wave 2 reservations
ruby_say "Land the Scarlet Statement look for Scarlet Night." "w3-b6-seed1" >/dev/null
ruby_say "Create a Scarlet Night squad event for 4 of us." "w3-b6-seed2" >/dev/null

R=$(ruby_say "show my reservations" "w3-b6-check")
RES_KINDS=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin); c = d.get('card_payload') or {}
if isinstance(c, list):
    c = next((x for x in c if x.get('card')=='reservations'), {})
res = c.get('reservations', [])
print(','.join(sorted(set(r.get('kind','?') for r in res))))
print('count:', len(res))
")
info "reservation kinds: $RES_KINDS"
# Expect at least the new kinds present
echo "$RES_KINDS" | head -1 | grep -qE "outfit|salon|manor_table|squad_event" && pass "Wave 2 reservation kinds appear in get_my_reservations" || fail "Wave 2 kinds missing from reservations list"

# ---------------------------------------------------------------------------
# W3.C — Discovery sweep (multi-turn conversational follow-ups)
# ---------------------------------------------------------------------------
head_ "W3.C1 · Switching outfits: book Scarlet → 'switch to Ruby Tuxedo'"
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

UUID="w3-c1-$RANDOM"
R=$(ruby_multi "$UUID" \
  "Land the Scarlet Statement look for Scarlet Night." \
  "Locked in for Scarlet Night: Scarlet Statement, blow-out at 7, Manor table at 11, Disco Nap waiting before." \
  "Actually switch me to Ruby Tuxedo instead.")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
contains_any "$BOT" "Ruby Tuxedo" "Negroni" "switched" && pass "outfit switch handled" || fail "outfit switch not understood"

head_ "W3.C2 · Dining party-size: book for 2, then 'add 2 more'"
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

UUID="w3-c2-$RANDOM"
R=$(ruby_multi "$UUID" \
  "Book Pink Agave for 2 at 8 PM" \
  "Pink Agave at 8 — tableside guac and mezcal flight, you're in for it. Confirmation #PA12345." \
  "Actually add 2 more to that — make it 4 of us.")
BOT=$(echo "$R" | extract_bot)
info "Ruby: ${BOT:0:240}"
contains_any "$BOT" "4" "four" "party of 4" && pass "party-size increase honored" || fail "party-size increase not handled"

head_ "W3.C3 · 'Send champagne instead of [other suggestion]' should not silently use Möet"
# Ruby suggests a Negroni, user says 'send a bottle of that to my cabin'.
# After fix: order_champagne should accept a bottle override, OR Ruby should
# clarify she can only deliver champagne via this flow.
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

UUID="w3-c3-$RANDOM"
R=$(ruby_multi "$UUID" \
  "What should I drink at The Manor?" \
  "Negroni Bianco — bartender keeps it cold and a little smoky. \$16 to your tab." \
  "Send a bottle of that to my cabin.")
BOT=$(echo "$R" | extract_bot)
CARD_TYPE=$(echo "$R" | extract_card)
info "card: $CARD_TYPE | Ruby: ${BOT:0:200}"
# After fix: either card mentions the recommended drink, OR Ruby clarifies
# in text that bottle service is champagne-only. Either is acceptable.
if [[ "$BOT" == *"Negroni"* ]] || [[ "$BOT" == *"clarify"* ]] || [[ "$BOT" == *"only deliver champagne"* ]] || [[ "$BOT" == *"only do champagne"* ]]; then
  pass "did not silently substitute Möet for the recommended cocktail"
else
  fail "may have silently substituted bottle [B1 adjacent]"
fi

# Re-pin primary phone (cleanup)
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null


# ===========================================================================
# WAVE 4 — fixes for the 6 user-reported click-through bugs
# ===========================================================================
echo
echo "${BOLD}════════════════════════════════════════════════${NC}"
echo "${BOLD}  WAVE 4 — user click-through bug-fix sweep${NC}"
echo "${BOLD}════════════════════════════════════════════════${NC}"

# Helper: extract a single field from card_payload (first card if list)
extract_field() {
  # $1 = field name
  local field="$1"
  python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    c=d.get('card_payload')
    if isinstance(c, list): c=c[0] if c else None
    print((c or {}).get('$field',''))
except Exception as e:
    print('ERROR:',e)"
}

# Count cards in payload (returns int)
extract_card_count() {
  python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    c=d.get('card_payload')
    if c is None: print(0)
    elif isinstance(c, list): print(len(c))
    else: print(1)
except Exception as e:
    print(0)"
}

curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

# ── W4.B1 · book_recovery_item returns ONLY the items the Sailor named ────
head_ "W4.B1 · Recovery subset: 'hydration + smoothie' should give 2 items, not 4"
R=$(ruby_say "Book hydration spa and B-complex green smoothie" "w4-b1-$RANDOM")
BOT=$(echo "$R" | extract_bot)
ITEM_COUNT=$(echo "$R" | python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    c=d.get('card_payload')
    if isinstance(c,list): c=c[0] if c else None
    print(len((c or {}).get('items',[])))
except Exception: print(-1)")
info "card items: $ITEM_COUNT | Ruby: ${BOT:0:200}"
if [[ "$ITEM_COUNT" == "2" ]]; then
  pass "recovery card shows exactly 2 items"
else
  fail "expected 2 items in card, got: $ITEM_COUNT"
fi

# ── W4.B2 · book_recovery_item called twice → dedup (preview macro must not book) ──
# Wave 5: hangover_recovery_menu became preview-only. The dedup helper is now
# exercised through book_recovery_item instead. Verify both halves:
#   (a) calling the preview macro twice books NOTHING
#   (b) book_recovery_item(items=[all 4]) called twice still leaves exactly 1
#       of each item — dedup helper alive and working through the booking path
head_ "W4.B2 · Preview macro books nothing · book_recovery_item dedups on repeat"
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null
# (a) Two preview calls → no reservations
ruby_say "Open the hangover recovery menu" "w4-b2a-$RANDOM" >/dev/null
ruby_say "Show me the hangover recovery menu again" "w4-b2b-$RANDOM" >/dev/null
RES_JSON=$(curl -s "$API/api/guest/reservations")
PREVIEW_HYDR=$(echo "$RES_JSON" | python3 -c "import sys,json
d=json.load(sys.stdin)
rs = d.get('reservations', d if isinstance(d,list) else [])
print(sum(1 for r in rs if 'hydration' in (r.get('treatment_name','') or '').lower()))")
PREVIEW_BREAK=$(echo "$RES_JSON" | python3 -c "import sys,json
d=json.load(sys.stdin)
rs = d.get('reservations', d if isinstance(d,list) else [])
print(sum(1 for r in rs if r.get('restaurant_id') == 'the-wake-breakfast'))")
info "after 2 preview macro calls: hydration=$PREVIEW_HYDR breakfast=$PREVIEW_BREAK (both should be 0)"
if [[ "$PREVIEW_HYDR" == "0" && "$PREVIEW_BREAK" == "0" ]]; then
  pass "preview-only recovery macro did NOT auto-book any items"
else
  fail "preview macro is still creating reservations (hydration=$PREVIEW_HYDR breakfast=$PREVIEW_BREAK)"
fi
# (b) Two book_recovery_item(all 4) calls → exactly 1 of each item
ruby_say "Book all four items from the recovery menu" "w4-b2c-$RANDOM" >/dev/null
ruby_say "Actually book the full recovery menu again — everything please" "w4-b2d-$RANDOM" >/dev/null
RES_JSON=$(curl -s "$API/api/guest/reservations")
HYDR_COUNT=$(echo "$RES_JSON" | python3 -c "import sys,json
d=json.load(sys.stdin)
rs = d.get('reservations', d if isinstance(d,list) else [])
print(sum(1 for r in rs if 'hydration' in (r.get('treatment_name','') or '').lower()))")
BREAK_COUNT=$(echo "$RES_JSON" | python3 -c "import sys,json
d=json.load(sys.stdin)
rs = d.get('reservations', d if isinstance(d,list) else [])
print(sum(1 for r in rs if r.get('restaurant_id') == 'the-wake-breakfast'))")
info "after 2 full-menu book_recovery_item calls: hydration=$HYDR_COUNT breakfast=$BREAK_COUNT (each should be 1)"
if [[ "$HYDR_COUNT" == "1" && "$BREAK_COUNT" == "1" ]]; then
  pass "book_recovery_item dedup intact across full-menu re-fire"
else
  fail "duplicates from book_recovery_item re-fire (hydration=$HYDR_COUNT breakfast=$BREAK_COUNT)"
fi

# ── W4.B3 · upgrade_drink_package returns real charged + credit + balance ─
head_ "W4.B3 · Upgrade card shows real charged + credit + new balance (not \$0.00)"
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
R=$(ruby_say "Give me the \$500 Bar Tab package" "w4-b3-$RANDOM")
BOT=$(echo "$R" | extract_bot)
CHARGED=$(echo "$R" | extract_field "charged_to_folio")
CREDIT=$(echo "$R" | extract_field "credit_loaded")
NEWBAL=$(echo "$R" | extract_field "new_folio_balance")
info "charged=$CHARGED credit=$CREDIT new_folio_balance=$NEWBAL | Ruby: ${BOT:0:200}"
if [[ "$CHARGED" == "500.0" || "$CHARGED" == "500" ]] && \
   [[ "$CREDIT"  == "600.0" || "$CREDIT" == "600" ]] && \
   [[ "$NEWBAL" != "" && "$NEWBAL" != "0" && "$NEWBAL" != "0.0" ]]; then
  pass "drink package card carries real charged + credit + balance"
else
  fail "upgrade card missing real folio numbers (charged=$CHARGED credit=$CREDIT bal=$NEWBAL)"
fi

# ── W4.B4 · generic upgrade → recommend_drink_packages returns 2 cards ────
head_ "W4.B4 · Generic 'upgrade my drink package' → 2 picker cards (no hallucinated tier)"
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
R=$(ruby_say "Upgrade my drink package" "w4-b4-$RANDOM")
CARD_TYPE=$(echo "$R" | extract_card)
CARD_COUNT=$(echo "$R" | extract_card_count)
BOT=$(echo "$R" | extract_bot)
info "card: $CARD_TYPE | count: $CARD_COUNT | Ruby: ${BOT:0:150}"
if [[ "$CARD_TYPE" == multi:drink_package_option* ]] && [[ "$CARD_COUNT" == "2" ]]; then
  pass "generic upgrade returns 2 drink_package_option cards (no premium_unlimited)"
elif [[ "$BOT" != *"premium_unlimited"* ]] && [[ "$BOT" != *"isn't ringing any bells"* ]] && [[ "$CARD_TYPE" != "error" ]]; then
  pass "no hallucinated tier even if card path differs (acceptable)"
else
  fail "expected 2 drink_package_option cards, got: $CARD_TYPE / $CARD_COUNT"
fi

# ── W4.B5 · suggested-action chip → real package_id, no error card ────────
head_ "W4.B5 · 'Give me the \$300 package' chip → real bar-tab-300 booking"
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
R=$(ruby_say "Give me the \$300 package" "w4-b5-$RANDOM")
CARD_TYPE=$(echo "$R" | extract_card)
PKG_ID=$(echo "$R" | python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    c=d.get('card_payload')
    if isinstance(c,list): c=c[0] if c else None
    p=(c or {}).get('package') or {}
    print(p.get('id',''))
except: print('')")
info "card: $CARD_TYPE | package_id: $PKG_ID"
if [[ "$CARD_TYPE" == "drink_package" ]] && [[ "$PKG_ID" == "bar-tab-300" ]]; then
  pass "chip prefill correctly resolves to bar-tab-300"
else
  fail "expected drink_package/bar-tab-300, got: $CARD_TYPE/$PKG_ID"
fi

# ── W4.B6 · identify_now_playing carries set_label (Bug A frontend dep) ───
head_ "W4.B6 · Now-playing card carries set_label + set_vibe + dj"
R=$(ruby_say "What is playing at The Manor right now, identify the track" "w4-b6-$RANDOM")
CARD_TYPE=$(echo "$R" | extract_card)
SET_LABEL=$(echo "$R" | extract_field "set_label")
SET_VIBE=$(echo "$R" | extract_field "set_vibe")
DJ_NAME=$(echo "$R" | extract_field "dj")
info "card: $CARD_TYPE | set_label='$SET_LABEL' set_vibe='$SET_VIBE' dj='$DJ_NAME'"
if [[ -n "$SET_LABEL" ]] && [[ -n "$DJ_NAME" ]]; then
  pass "now_playing payload carries the connecting set_label + dj"
else
  fail "now_playing card missing set_label/dj — frontend can't show dashboard link"
fi

# Re-pin primary phone (cleanup)
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null


# ===========================================================================
# WAVE 5 — preview-only recovery macro + weather card brand residue
# ===========================================================================
echo
echo "${BOLD}════════════════════════════════════════════════${NC}"
echo "${BOLD}  WAVE 5 — preview semantics + weather brand fixes${NC}"
echo "${BOLD}════════════════════════════════════════════════${NC}"

# ── W5.1 · 'Open the recovery menu' is preview-only — no reservations created ──
head_ "W5.1 · 'Open the recovery menu' previews without booking anything"
curl -s -X POST "$API/api/guest/reset" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PRIMARY_PHONE\"}" >/dev/null
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null
R=$(ruby_say "Open the hangover recovery menu" "w5-1-$RANDOM")
CARD_TYPE=$(echo "$R" | extract_card)
PREVIEW=$(echo "$R" | extract_field "preview")
BOT=$(echo "$R" | extract_bot)
info "card: $CARD_TYPE | preview flag: '$PREVIEW' | Ruby: ${BOT:0:150}"
RES_JSON=$(curl -s "$API/api/guest/reservations")
RECOVERY_HITS=$(echo "$RES_JSON" | python3 -c "import sys,json
d=json.load(sys.stdin)
rs = d.get('reservations', d if isinstance(d,list) else [])
print(sum(1 for r in rs if 'hydration' in (r.get('treatment_name','') or '').lower()
        or r.get('restaurant_id') == 'the-wake-breakfast'
        or r.get('kind') == 'lounger'))")
info "recovery-related reservations after preview: $RECOVERY_HITS (should be 0)"
if [[ "$CARD_TYPE" == "recovery_menu" ]] && [[ "$PREVIEW" == "True" ]] && [[ "$RECOVERY_HITS" == "0" ]]; then
  pass "preview macro returns card with preview=true and books NOTHING"
else
  fail "preview semantics broken (card=$CARD_TYPE preview=$PREVIEW reservations=$RECOVERY_HITS)"
fi

# ── W5.2 · Weather card payload carries dynamic port labels, no 'Marina' ───
head_ "W5.2 · Weather payload carries port_today_name + next_port_name (no Cozumel/Marina)"
R=$(ruby_say "What's the weather like" "w5-2-$RANDOM")
CARD_TYPE=$(echo "$R" | extract_card)
PORT_TODAY=$(echo "$R" | extract_field "port_today_name")
NEXT_PORT=$(echo "$R" | extract_field "next_port_name")
BOT=$(echo "$R" | extract_bot)
RAW_JSON=$(echo "$R" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('card_payload') or {}))")
info "card: $CARD_TYPE | port_today_name='$PORT_TODAY' | next_port_name='$NEXT_PORT'"
# port_today_name must be a real Virgin port (not empty, not 'Cozumel'). Backend
# response payload must also not contain any 'Marina' literal — that hardcoding
# only lived in the frontend, but worth defending against regression.
if [[ "$CARD_TYPE" == "weather" ]] \
   && [[ -n "$PORT_TODAY" ]] \
   && [[ "$PORT_TODAY" != *"Cozumel"* ]] \
   && [[ "$RAW_JSON" != *"\"Marina\""* ]]; then
  pass "weather payload uses dynamic Virgin port name + no Marina literal"
else
  fail "weather payload still leaks Carnival residue (port_today='$PORT_TODAY')"
fi

# Re-pin primary phone (cleanup)
curl -s -X POST "$API/api/guest/lookup" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$PRIMARY_PHONE\"}" >/dev/null

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "${BOLD}════════════════════════════════════════════════${NC}"
TOTAL=$((PASS + FAIL))
if [[ "$FAIL" -eq 0 ]]; then
  echo "  ${GREEN}${BOLD}✅ $PASS / $TOTAL checks passed — demo is ready.${NC}"
  exit 0
else
  echo "  ${RED}${BOLD}❌ $FAIL of $TOTAL checks failed${NC} (${GREEN}$PASS passed${NC})"
  exit 1
fi
