# Ruby Demo Script — Virgin Voyages, Scarlet Lady

> **Setup**: Open the app at 390×844 (iPhone 14 Pro) in browser DevTools.
> Backend on `:8000`, frontend on `:5173`. Sound on. Access code: `hpe-carnival`.
>
> **Guest selector cheat sheet:**
> | Phone | Sailor | Tier | What it shows |
> |---|---|---|---|
> | `9999999990` | Vivian Bell | **Sea Terrace** | The primary demo guest — Extra Virgin booked tonight |
> | `9999999995` | Avery Quinn | **RockStar** | Tolopea badge + Richard's Rooftop perks card |
> | `9999999998` | Tanaka | **Mega RockStar** | Gold badge, $0 folio, unlimited bar tab |
> | `9999999993` | Carlos Mendez | **Insider** | Spanish-speaker for multilingual demo |
>
> QR fast-path: `http://localhost:5173/?phone=9999999990`

---

## 0. The 60-second Cold Open

| # | Action | What to show |
|---|---|---|
| 0.1 | Land on dashboard as Vivian (`?phone=9999999990`) | Red hero banner + Scarlet Lady photo, "Day 4 of 6", Puerto Plata pin, **Sea Terrace Sailor** badge |
| 0.2 | Scroll past the voyage timeline | **Tonight's Look** card with live countdown + 3 outfit thumbnails, then **Shake for Champagne**, then **Now Playing at The Manor** |

---

## 1. Meet Ruby — Persona & Voice

| # | Type / say | What to show |
|---|---|---|
| 1.1 | `hi` | Cheeky, on-brand: "Honey, you're back. What's the move, Vivian?" |
| 1.2 | `who are you?` | "I'm Ruby, your onboard concierge for Scarlet Lady..." |
| 1.3 | `what's tonight?` | Booked! at 7, Persephone at 9, UNTITLED DANCESHOWPARTYTHING at 10:30, Klub Rubik's at 11:30 — all real Virgin shows |

**What you should NOT hear**: "Marina", "Carnival", "Celebration", "VIFP Gold", "Cucina del Capitano", "CHEERS!", "Cozumel".

---

## 2. HERO #1 — Shake for Champagne 🥂

### 2a. Via the dashboard card (button path)

| # | Action | What to show |
|---|---|---|
| 2.1 | Tap the **Press for Champagne** red button on the dashboard card | Red curtain reveal → modal with the iconic red bucket SVG + "Möet & Chandon Impérial · 750ml · $105 · to Cabin 10245 · Deck 10" |
| 2.2 | Tap **Send it 🥂** | Switches to live tracker: "On its way, honey · On The Rocks bar, Deck 6 → Cabin 10245" + countdown `M:SS` + animated deck cross-section with a moving red dot |
| 2.3 | Tap **Minimise** to close, then scroll to **Onboard Account** | New $105 line item: "Möet & Chandon Impérial 750ml — delivered to Cabin 10245" |

### 2b. Via Ruby (chat path — same tool)

| # | Type / say | What to show |
|---|---|---|
| 2.4 | `bring me a bottle to the pool` | Champagne card + "Möet & Chandon Impérial on its way to the pool deck — about 7 minutes" |
| 2.5 | `send a bottle to my cabin instead` | Second champagne card with new confirmation ID |

### 2c. Real phone shake (mobile-only)

| # | Action | What to show |
|---|---|---|
| 2.6 | On iPhone Safari, tap **Enable shake** once (iOS permission prompt) | "📳 …or just shake your phone." |
| 2.7 | Shake the phone briskly | Same reveal as 2.1 — gesture works fleet-wide in the app |

---

## 3. HERO #2 — Tonight's Look (Scarlet Night stylist)

### 3a. Quick-pick from the dashboard card

| # | Action | What to show |
|---|---|---|
| 3.1 | Note the live countdown — "Scarlet Night in ~Xh Xm Xs" + "Dress code: RED — non-negotiable" | Card animates the timer every second |
| 3.2 | Tap the **Scarlet Statement** thumbnail | Chat opens prefilled: "I want the Scarlet Statement look for Scarlet Night. Pre-book a blow-out at 7 PM and reserve me a table at The Manor at 11 PM..." |
| 3.3 | Watch Ruby respond | Calls `book_salon` → returns a salon_booking card (Blow-Out · 7:00 PM · Redemption Spa Salon · $65 · confirmation `SAL…`) |
| 3.4 | Tap the next hint chip Ruby suggests | She chains the next step — Manor table or pre-show cocktail |
| 3.5 | Tap the bigger ✨ **Sort it all for me** CTA | Multi-step plan: outfit suggestion → salon → dinner → Manor |

### 3b. Through Ruby (free-form)

| # | Type / say | What to show |
|---|---|---|
| 3.6 | `what should I wear for Scarlet Night?` | **outfit_suggestion** card with 3 looks (Scarlet Statement, Ruby Tuxedo, After-Hours Red) — each has an image, vibe line, "Land this look" button |
| 3.7 | Tap **Land this look** on Ruby Tuxedo | Chat sends "I want Ruby Tuxedo — book the salon and a Manor table to land it" |
| 3.8 | `book me a blow-out at 7 PM` | **salon_booking** card |
| 3.9 | `what should I drink at The Manor?` | **drink_pairing** card — Negroni Bianco, $16 |
| 3.10 | `book me a manicure at 6:30` | salon_booking card — Express Manicure, $45 |

---

## 4. Dining — Virgin Venues (no cover, all included)

| # | Type / say | What to show |
|---|---|---|
| 4.1 | `book Italian for 7:30 for 2` | **Extra Virgin** card (not Cucina!) — hand-rolled tagliatelle |
| 4.2 | `move that to 9 PM` | Modified dining card |
| 4.3 | `book Mexican for 8 PM` | **Pink Agave** card — tableside guac + mezcal flight |
| 4.4 | `book steak at 7:30` | **The Wake** — dry-aged ribeye, sweeping wake views |
| 4.5 | `book me Korean BBQ` | **Gunbae** — wagyu short rib + interactive soju games |
| 4.6 | `what's the chef's tasting menu?` | The Test Kitchen — 7-course narrative menu |
| 4.7 | `what's the cover charge at Pink Agave?` | "Nothing, honey, it's all included." (Never invents a price) |

---

## 5. Shows — The Red Room & The Manor

| # | Type / say | What to show |
|---|---|---|
| 5.1 | `book 2 seats for Persephone` | Show card — The Red Room, Deck 6 |
| 5.2 | `book the drag show tonight` | Lights, Camera, Drag! at 8 PM |
| 5.3 | `book Klub Rubik's for 2` | '80s dance party, The Manor upper deck, 11:30 PM |
| 5.4 | `cancel Persephone` | Cancel card |

---

## 6. Branson / Virgin Records — Brand DNA

| # | Type / say | What to show |
|---|---|---|
| 6.1 | `tell me about The Manor and Branson` | "Branson's love letter to Virgin Records" + Mike Oldfield's Tubular Bells (1972) + Sex Pistols story |
| 6.2 | `what's the vibe at The Manor?` | Two-story nightclub, day lounge → evening cabaret → late-night dance floor |
| 6.3 | `what's on at The Manor tonight?` | UNTITLED DANCESHOWPARTYTHING at 10:30 + Klub Rubik's at 11:30 |
| 6.4 | Tap **🎶 Set the Vibe — Spotify** on the Now Playing card | Opens real Spotify playlist (deep-link, native app on mobile) |

---

## 7. Multi-step "Sort my night, Ruby"

Demonstrates the agent's hint-driven chain (Ruby suggests next steps via hint chips).

| # | Type / say | What to show |
|---|---|---|
| 7.1 | `sort tonight — dinner at 8, show at 10, drink before` | Books dinner → next hint suggests show → next hint suggests drink |
| 7.2 | Tap each follow-up hint chip in sequence | Salon → Manor table → Negroni — feels like a conversation, not a wall of cards |
| 7.3 | `what have I booked?` | **reservations** card — all of tonight's plans listed with confirmations |

---

## 8. Tier-aware features — Switch Sailor

| # | Action | What to show |
|---|---|---|
| 8.1 | Tap **Switch** in the header → enter `9999999998` (Tanaka) | Header now shows **Mega RockStar Sailor** in gold |
| 8.2 | Scroll | New **★ Mega RockStar Perks** card — Richard's Rooftop, unlimited bar tab, Thermal Suite, Premium Wi-Fi, RockStar Agent |
| 8.3 | Check Onboard Account | $0 balance, charges show "(included)" |
| 8.4 | Switch to `9999999995` (Avery Quinn) | **RockStar Sailor** in Tolopea purple + 4-perk card |
| 8.5 | Switch to `9999999994` (Johnson — Insider) | No perks card (tier doesn't qualify), neutral grey tier badge |

---

## 9. "Always Included" framing

| # | Type / say | What to show |
|---|---|---|
| 9.1 | `what's the cover at The Wake?` | "Nothing — all included." |
| 9.2 | `do I have to pay for Wi-Fi?` | "Basic Wi-Fi is included. Premium for streaming is $20/day — or free if you're Mega RockStar." |
| 9.3 | `how much is dinner at Pink Agave?` | "All included, honey. Even the mezcal flight is on you sipping." |

---

## 10. Spanish — multilingual

Switch to `9999999993` (Carlos Mendez, language: es).

| # | Type / say | What to show |
|---|---|---|
| 10.1 | `¿qué hay para cenar esta noche?` | Ruby replies in Spanish, surfaces Extra Virgin / Pink Agave / The Wake / Gunbae |
| 10.2 | `tráeme champán a la piscina` | order_champagne fires, reply in Spanish |
| 10.3 | `¿qué me pongo para Scarlet Night?` | 3 looks suggested in Spanish |

---

## 11. Edge cases & error handling

| # | Type / say | What to show |
|---|---|---|
| 11.1 | `book Extra Virgin at 7:30` *(when already booked)* | "Honey, you've already got a table at Extra Virgin at 7:30 — can't double-book perfection!" |
| 11.2 | `cancel the Italian place` | Resolves to Extra Virgin, cancels |
| 11.3 | `book a 90-min hot stone at 4 PM` | spa_booking card — Redemption Spa, $199, 80 min |
| 11.4 | `cancel my non-existent booking` | Friendly error, lists what you actually have |

---

## 12. Voice mode (if mic enabled)

| # | Action | What to show |
|---|---|---|
| 12.1 | Tap the 🎙️ mic, say *"book Pink Agave for two at eight"* | Speech-to-text → same Pink Agave booking flow → Ruby speaks the confirmation via ElevenLabs |
| 12.2 | Voice in Spanish: *"reserva Extra Virgin a las siete y media"* | Detected as ES, response in Spanish |

---

## 13. Visual leak checks (what you should NOT see anywhere)

Scroll the whole app, open every panel. If you spot any of these, it's a residual Carnival leak — flag it:

- 🚫 The word "Marina" (Ruby everywhere)
- 🚫 The word "Carnival" or "Celebration" (Virgin Voyages / Scarlet Lady)
- 🚫 "VIFP Gold/Platinum" (Sea Terrace / RockStar / Mega RockStar Sailor)
- 🚫 "CHEERS!" (Bar Tab)
- 🚫 "Cozumel" / "Celebration Key" (Bimini / Puerto Plata)
- 🚫 "Cucina del Capitano", "Fahrenheit 555", "Big Chicken", "Guy's Burger" (Extra Virgin, The Wake, etc.)
- 🚫 "Punchliner Comedy Club", "Liquid Lounge", "Limelight Lounge" (Persephone, The Red Room, The Manor)
- 🚫 "Cloud 9 Spa" (Redemption Spa)

---

## 14. Automated regression

After any change, run:

```bash
./scripts/test-virgin-demo.sh
```

68 checks · ~90 seconds · all-green means demo-ready.

For performance baselines (response latency, memory growth):

```bash
./scripts/perf-audit.sh --no-bundle
```

Reads against the running backend, writes `WAVE2_PERF.md` with measured vs. target latency.

---

# Wave 2 — Bug fix + 8 new features

Everything below is new since Wave 1. The bug fix is invisible to the user (the broken outfit flow just works now); the 8 new features each have a dashboard chip in **Quick Actions** plus a chat-triggerable prompt.

> **Tip:** before showing Wave 2 features in a demo, reset the primary guest so the folio/reservations are clean: `curl -s -X POST http://localhost:8000/api/guest/reset -H "Content-Type: application/json" -d '{"phone":"9999999990"}'`

## W1. Bug fix — Tonight's Look macro (`land_the_look`)

The original flow had all 3 outfit thumbnails producing identical results (same confirmation #, same cocktail). Fixed via a `land_the_look(look_id, salon_time?, manor_time?)` macro that returns **4 distinct cards in one turn** — outfit + salon + Manor table + a look-specific cocktail.

| # | Action | What to show |
|---|---|---|
| W1.1 | Tap **Scarlet Statement** thumbnail | 4 cards stream in: outfit_confirmed (with image + vibe) · Blow-Out at Redemption · Manor table at 11 · Disco Nap at On The Rocks. Each card has a UNIQUE confirmation # |
| W1.2 | Tap **Ruby Tuxedo** thumbnail | 4 cards — same structure but the cocktail is now **Negroni** and confirmation #s are different |
| W1.3 | Tap **After-Hours Red** thumbnail | 4 cards — cocktail is **Mezcal Mule at Loose Cannon** |
| W1.4 | Type `land the Scarlet Statement look` in chat | Same 4-card response — proves the macro works through chat too |
| W1.5 | Type `land the Ruby Tuxedo look — Manor table at midnight` | Macro respects the `manor_time` override |
| W1.6 | Open the **Reservations** widget | 3 distinct entries per look attempt: Outfit, Salon, Manor table |

**Leak check**: confirmation IDs across the 3 looks should be 3 different SAL### numbers. If they're all the same, the bug regressed.

## W2. Manor Shazam — `identify_now_playing`

| # | Action | What to show |
|---|---|---|
| W2.1 | Tap the new **🎧 Shazam** button on the Now Playing at The Manor widget | Card streams in: track name + artist + year + Branson-era trivia (e.g., "Sex Pistols — Branson signed them after EMI dropped them") + "✓ Saved to My Cruise Soundtrack" + tap-to-open Spotify search button |
| W2.2 | Tap **Open in Spotify ↗** on the card | External Spotify search opens with track+artist (web on desktop, native app on mobile) |
| W2.3 | Type `what is playing right now at The Manor?` | Same now_playing_track card via chat. Track rotates every 6 minutes deterministically |

## W3. Hangover Saver — `hangover_recovery_menu`

| # | Action | What to show |
|---|---|---|
| W3.1 | Tap the **🥴 Recovery menu** chip in Quick Actions | Single `recovery_menu` card with 4 menu items: hydration drip $95 (Redemption) · B-Complex smoothie $12 · late breakfast at The Wake (Included) · Perch cabana siesta $25. Brand voice: "Late one, honey?" |
| W3.2 | Check **Reservations** | Hydration drip at Redemption + late breakfast at The Wake appear as real bookings (separate restaurant_id from a normal Wake dinner — won't block a later dinner reservation) |
| W3.3 | Check **Folio** | +$95 spa + $25 cabana lounger lines (smoothie + breakfast are included) |

## W4. Surprise Mode — `arrange_surprise`

| # | Action | What to show |
|---|---|---|
| W4.1 | Tap the **🎁 Surprise mode** chip | 3-card response: `surprise_summary` (flowers + dinner + champagne + dessert + cellist extras), `dining` (The Wake at 8 PM), `champagne` (Möet table-side) |
| W4.2 | Try `arrange a birthday surprise for Yuki` | Preset switches to Pink Agave + Veuve Clicquot + mariachi extras |
| W4.3 | Try `arrange a proposal surprise — make it big` | Preset switches to Dom Pérignon + white rose + photographer-on-standby + ring kept by RockStar Agent |
| W4.4 | Reservations show: `Anniversary surprise for your partner`, dining at The Wake, flowers delivery — all separately bookable |

## W5. Scarlet Night Squad Mode — `create_squad_event`

| # | Action | What to show |
|---|---|---|
| W5.1 | Tap the **👥 Squad night** chip | Single `squad_event` card: "Group of 4 · Squad invited: You + Lisa P., Marcus T., Priya R. · 7–8 PM salon window · pre-toast at On The Rocks at 10:30 · Manor table at 11 PM · share link" |
| W5.2 | Try `create a Scarlet Night squad event for 6` | Card adapts to 6, lists 5 mock invitees |

**Honest caveat** (per Plan agent): this is *cosmetic-only* in Wave 2. No real per-member reservations are inserted — we don't have a multi-guest data model. Don't drill into "did Lisa actually get the blow-out?" during demo.

## W6. Voyage Diary — `get_voyage_diary`

| # | Action | What to show |
|---|---|---|
| W6.1 | Tap the **📔 Today's diary** chip | Visually rich `voyage_diary` card: illustrated header for the day · stats row (Venues, Photos, Tracks, Today's spend) · moments list pulled from real folio + reservations · "Tap to share your Scarlet Lady chapter →" |
| W6.2 | Try `show me the diary for day 2` | Same card with the day-2 illustration and only day-2's moments |
| W6.3 | After running Surprise Mode (W4), reload the diary | The newly-booked dining + champagne show up as moments |

**Sleeper hit** (per Plan agent's note): this is the most "could not exist without AI" feature on the list. Drives organic social share post-cruise.

## W7. What should I drink right now? — `recommend_drink_now`

| # | Action | What to show |
|---|---|---|
| W7.1 | Tap the **🍸 What to drink?** chip | `drink_pairing` card with a mood-tailored pick + caption ("Caffeine plus crema — long night ahead") |
| W7.2 | Try `I'm feeling celebratory — what should I drink?` | Switches to Krug pour at Red Bar |
| W7.3 | Try `I'm winding down` | Switches to Smoked Old Fashioned at On The Rocks |
| W7.4 | Try `I'm fired up` | Mezcal Mule at Pink Agave bar |

Distinct from existing `recommend_pre_show_drink(venue)` which keys off venue, not mood.

## W8. Pack Forecaster — `generate_packing_list`

| # | Action | What to show |
|---|---|---|
| W8.1 | Tap the **🎒 Packing list** chip | `packing_list` card with **6 sections** — Scarlet Night Required (RED non-negotiable) · Bimini Beach Club · Manor Late-Night · Spa & Wellness · Daily Casuals · Tech & Docs. Each item flagged ESSENTIAL / RECOMMENDED / OPTIONAL with checkboxes. |
| W8.2 | Verify NO formal-wear entries, NO kid items (it's an adult-only ship) |
| W8.3 | Verify Bimini section has swimwear, linen, reef-safe SPF | Tailored to itinerary |

## W9. Pre-Boarder for Bimini — `prebook_bimini_day`

| # | Action | What to show |
|---|---|---|
| W9.1 | Tap the **🏝 Pre-board Bimini** chip | **4 cards** stream in: `port_day_plan` (weather + 6-step agenda) · `excursion` (real Bimini cabana booking) · `dining` (Beach Club lunch buffet) · `drink_pairing` (Bimini Punch at 6:30 sunset) |
| W9.2 | Try `pre-board Bimini for 4` | party_size respected in cabana + lunch |
| W9.3 | Reservations show **3 new entries**: port_day_plan, excursion, lunch dining |

## W10. Quick demo loop (Wave 2 sales pitch — 90 seconds)

In this order, the wave-2 demo lands hardest:

| # | Tap / say | Why this order |
|---|---|---|
| 1 | Tap **Scarlet Statement** in Tonight's Look | 4 cards stream in — bug fix invisible-but-felt |
| 2 | Tap **🎁 Surprise mode** | 3 cards — multi-tool coordination at scale |
| 3 | Tap **🎒 Packing list** | The "AI for the boring parts" moment — exec dads love this |
| 4 | Tap **🎧 Shazam** on the Manor widget | Branson trivia drops — emotional moment |
| 5 | Tap **📔 Today's diary** | "Could not exist without AI" — sleeper hit |
| 6 | Tap **🥴 Recovery menu** | Big laugh from the adult-only audience |
| 7 | Tap **🏝 Pre-board Bimini** | Port-day delegation — premium tier value |

If you only get 3 taps with the exec: **Scarlet Statement → Surprise mode → Voyage Diary.**

