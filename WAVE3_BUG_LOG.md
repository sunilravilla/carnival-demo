# Wave 3 Bug Log — CLOSED

End-state catalog from the discovery-then-fix sweep.
**Round 5 final: curl 77/77 · Playwright 14/14 · all bugs closed.**

---

## Closed bugs (all 6 reported + 1 audit-discovered + 1 test-infra)

### Tier 1 — demo-killers (all CLOSED ✅)

| # | Bug | Status | Fix |
|---|---|---|---|
| B1 | Wrong-bottle on "send it to my cabin" follow-up — order_champagne hardcoded to Möet | ✅ closed | `order_champagne(args)` now accepts optional `bottle` / `price` / `dispatched_from`. System prompt teaches Ruby to chain: when user says "send it" after a drink recommendation, pass `bottle=` from the previous turn's recommendation. Verified: Krug recommendation → "send to cabin" now produces a Krug Grande Cuvée card. |
| B2 | Surprise mode champagne shows ETA ~7 min for a future scheduled dinner | ✅ closed | `order_champagne` now accepts optional `scheduled_time` (HH:MM). When set, returns `scheduled_for` field; ChampagneCard frontend renders "Pre-poured at 8:00 PM" instead of "ETA ~7 min". `arrange_surprise` passes the dinner time + the preset's champagne name + bottle-tier price. |
| B3 | Squad event narrates Lisa P. / Marcus T. as if they're real invitees | ✅ closed | Card now carries `is_demo_data: true` + `invitee_label: "Suggested invitees (tap to swap)"` + `invitee_hint`. Frontend SquadEventCard renders invitee chips with dashed border, muted color, italic, "tap to swap" tooltip + "+ invite your own" pill. Ruby's natural-reply re-framed to "sailors you've cruised with before — suggested invitees". |
| B4 | Music mismatch — dashboard widget vs chat Shazam rotate independently | ✅ closed | Both data sources now share a `set_name` key. Backend `_MANOR_HOUR_LOOKUP` + frontend `HOUR_TO_SET_NAME` are mirrored deterministic dicts. Shazam tool filters its tracklist to the current hour's set, returns `set_name` + `dj` so the connection is visible in the card. Also fixed a sub-bug: the previous "latest entry where s.h ≤ now" iteration was always returning the h=3 winddown set for any hour ≥ 3 (after-midnight rollover bug, both sides). |

### Tier 1 — newly discovered during sweep (all CLOSED ✅)

| # | Bug | Status | Fix |
|---|---|---|---|
| B7 | "Add 2 more to dinner" — modify_dining required new_time even for party-size-only changes | ✅ closed | `_tool_modify_dining` now allows party-size-only updates: if `new_party_size` is supplied without `new_time`, look up the existing reservation's time and reuse it. System prompt also got a new CRITICAL rule: party-size changes → modify_dining (never book_dining). |
| B8 | "Send a bottle of [non-champagne] to my cabin" silently swapped in Möet | ✅ closed | Subsumed by B1 (same `bottle` parameter). System prompt also clarifies: for non-champagne drinks, Ruby should either pass the recommended name as `bottle=` OR confirm in `say` that bottle service is champagne-only. |

### Tier 2 (CLOSED ✅)

| # | Bug | Status | Fix |
|---|---|---|---|
| B6 | ReservationWidget missing Wave 2 icons + treatment_name fallback — kids showed as "Reservation" with no icon | ✅ closed | TYPE_ICON extended with 8 new kinds (outfit / salon / manor_table / squad_event / surprise / flowers / port_day_plan / recovery_menu). resName fallback chain now includes `treatment_name`. |

### Tier 3 (CLOSED — was a false-positive ✅)

| # | Bug | Status | Notes |
|---|---|---|---|
| B5 | "Book hydration drip" allegedly routed back to full recovery_menu | ✅ closed (not reproducible after Wave 3 system-prompt tightening) | Both Playwright (spec 05) and curl (W3.B5) confirmed Ruby fires specific bookings (book_spa_treatment) for named items. The system-prompt updates that landed for B1/B7 also tightened tool selection generally. |

### Test infrastructure (CLOSED ✅)

| # | Issue | Status | Fix |
|---|---|---|---|
| TI-1 | Playwright `sendChat` helper relied on whole-body innerText-length stability — dashboard text drowned the chat updates → tests resolved before Ruby finished | ✅ closed | New `sendChat` uses input-disabled state as the in-flight signal: wait for input to become disabled (request started), then wait for it to be re-enabled (Ruby done). Reliable: 14/14 specs pass on R5 vs 11/14 on R1. |
| TI-2 | `ruby_multi` bash helper passed sys.argv incorrectly — uuid was being read as "-c" | ✅ closed | Fixed argv indexing: uuid is `sys.argv[1]`, messages start at `sys.argv[2]`. Multi-turn follow-up tests went from spurious-failing to all-passing. |
| TI-3 | Smoke spec's input locator was too broad — matched both AccessGate input and chat input after page change | ✅ closed | Switched to `#access-input` id selector for the AccessGate input. |

---

## Round-by-round trajectory

| Round | Curl | Playwright | New bugs surfaced |
|---|---|---|---|
| R1 baseline | 71 / 77 (6 fail) | 11 / 14 (3 fail) | B1, B2, B3, B4 confirmed · B7, B8 new from sweep · B6 from audit · TI-1, TI-3 test-infra |
| R2 after backend fixes | 74 / 77 (3 fail) | 13 / 14 (1 fail) | TI-2 (multi-turn helper) |
| R3 after TI-2 fix attempt | 71 / 77 (6 fail) | 14 / 14 ✅ | (TI-2 fix was buggy — sys.argv indexing) |
| R4 after TI-2 proper fix | 76 / 77 (1 fail) | not re-run | only B7 left |
| R5 after B7 fix | **77 / 77 ✅** | **14 / 14 ✅** | NONE |

---

## Out of scope / deferred to Wave 4

- B10: Recovery menu cancellation atomicity (per-item reversal)
- Per-member squad state (real multi-guest coordination model)
- Real time-based smart trigger for the Hangover Saver chip (still demo-scripted, intentionally)
- Multi-session state isolation (`ship_data` still module-global — acceptable for demo)
- Agent-as-user simulation script (deferred from Wave 3 plan — current tests caught everything that mattered)

---

## Demo-readiness summary

**Ready for the Virgin executive team.**

Wave 1 (35) + Wave 2 (33) + Wave 3 (9 new conversational + structural) = **77 automated checks all green** · plus **14 Playwright browser specs all green**. All 8 originally-reported bugs and adjacent issues fixed. Demo flow validated end-to-end: dashboard renders cleanly, all chat tools route correctly including multi-turn follow-ups, no Carnival residue anywhere.
