"""Onboard concierge agent — Virgin Voyages, Scarlet Lady demo.

Concierge persona: Ruby. Warm + cheeky, music-literate (Branson / Virgin
Records DNA), knows the ship's venues cold, "Always Included" framing.

Uses Anthropic Claude in JSON-output mode. The model returns:
    {"tool": "<name|null>", "args": {...}, "say": "<reply>"}

The agent dispatches the named tool, then does a finalize pass for natural
language. System prompt is cached via Anthropic ephemeral cache_control.
"""

import asyncio
import logging
import re
import time as _time
from datetime import date, timedelta
from typing import Any, Callable, Dict, List, Optional

import httpx

from app.services import ship_data
from app.services.llm_client import create_client_from_env

logger = logging.getLogger(__name__)


def _cruise_date(day_offset: int = 0) -> str:
    """Return ISO date string for cruise departure + day_offset."""
    cruise = ship_data.get_cruise()
    dep = date.fromisoformat(cruise["departure_date"])
    return (dep + timedelta(days=day_offset)).isoformat()


def _today_date() -> str:
    cruise = ship_data.get_cruise()
    return _cruise_date(cruise["current_day"] - 1)


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def _tool_get_today_schedule(_args: Dict[str, Any]) -> Dict[str, Any]:
    cruise = ship_data.get_cruise()
    return {
        "card": "today",
        "ship": cruise["ship"],
        "day_label": f"{cruise['today_label']} of {cruise['total_days']}",
        "next_port": cruise["next_port"],
        "highlights": [
            {"time": "15:00", "title": "Beach Club Yoga (returning sailors)", "venue": "B-Complex, Deck 5"},
            {"time": "19:00", "title": "Booked! — musical theatre", "venue": "The Red Room, Deck 6"},
            {"time": "22:00", "title": "Festival Stage — tonight's headliner", "venue": "The Manor, Deck 6"},
        ],
    }


def _tool_book_dining(args: Dict[str, Any]) -> Dict[str, Any]:
    restaurant_query = args.get("restaurant") or args.get("name") or ""
    time = args.get("time", "19:30")
    party_size = int(args.get("party_size") or args.get("party") or 2)

    restaurant = ship_data.find_restaurant(restaurant_query)
    if not restaurant:
        return {"card": "error", "error": f"I could not find a restaurant matching '{restaurant_query}'."}

    # Duplicate guard
    for r in ship_data.list_reservations():
        if r.get("kind") == "dining" and r.get("restaurant_id") == restaurant["id"]:
            return {
                "card": "error",
                "error": (
                    f"You already have a reservation at {restaurant['name']} "
                    f"at {_human_time(r['time'])} for {r['party_size']} — "
                    f"confirmation #{r['confirmation_id']}. Want to modify the time or party size instead?"
                ),
            }

    if restaurant["available_times"] and time not in restaurant["available_times"]:
        time = min(restaurant["available_times"], key=lambda t: abs(_minutes(t) - _minutes(time)))

    confirmation_id = f"C{abs(hash((restaurant['id'], time))) % 100000:05d}"
    saved = ship_data.add_reservation("dining", {
        "restaurant_id": restaurant["id"],
        "restaurant_name": restaurant["name"],
        "time": time,
        "party_size": party_size,
        "confirmation_id": confirmation_id,
    })
    # Attach tonight's real show names so the finalize pass can cross-sell
    # without hallucinating names that don't exist in the data.
    tonight_shows = [
        {"name": s["name"], "time": _human_time(s["time"]), "venue": s["venue"]}
        for s in ship_data.get_all_shows()
    ]
    return {
        "card": "dining",
        "restaurant": {
            "name": restaurant["name"],
            "cuisine": restaurant["cuisine"],
            "location": restaurant["location"],
            "headline_dish": restaurant.get("headline_dish"),
            "cover_charge": restaurant.get("cover_charge", 0),
        },
        "time": time,
        "time_human": _human_time(time),
        "date": _today_date(),
        "party_size": party_size,
        "confirmation_id": confirmation_id,
        "reservation": saved,
        "tonight_shows": tonight_shows,
    }


def _tool_book_show(args: Dict[str, Any]) -> Dict[str, Any]:
    show_query = args.get("show") or args.get("name") or "comedy"
    count = int(args.get("count") or args.get("seats") or 2)

    show = ship_data.find_show(show_query)
    if not show:
        available = [f"{s['name']} at {_human_time(s['time'])}" for s in ship_data.get_all_shows()]
        return {
            "card": "error",
            "error": (
                f"I don't have a show called '{show_query}' on tonight's schedule. "
                f"We do have: {', '.join(available)}. Which one would you like?"
            ),
        }

    # Duplicate guard
    for r in ship_data.list_reservations():
        if r.get("kind") == "show" and r.get("show_id") == show["id"]:
            return {
                "card": "error",
                "error": (
                    f"You already have {r['count']} seat(s) reserved for {show['name']} "
                    f"at {_human_time(r['time'])} — confirmation #{r['confirmation_id']}. "
                    f"Want me to cancel and rebook, or add more seats?"
                ),
            }

    if show["available_seats"] < count:
        return {"card": "error", "error": f"Only {show['available_seats']} seats left for {show['name']}."}

    confirmation_id = f"S{abs(hash((show['id'], count))) % 100000:05d}"
    seat_label = f"Row F · seats {7} & {8}" if count == 2 else f"{count} together · row F"
    saved = ship_data.add_reservation("show", {
        "show_id": show["id"],
        "show_name": show["name"],
        "venue": show["venue"],
        "time": show["time"],
        "count": count,
        "confirmation_id": confirmation_id,
    })

    result = {
        "card": "show",
        "show": {
            "name": show["name"],
            "venue": show["venue"],
            "headliner": show.get("headliner"),
            "rating": show.get("rating"),
            "duration_min": show.get("duration_min"),
        },
        "time": show["time"],
        "time_human": _human_time(show["time"]),
        "date": _today_date(),
        "count": count,
        "seat_label": seat_label,
        "confirmation_id": confirmation_id,
        "reservation": saved,
    }

    # Conflict detection: dining reservation ending within 90 min of showtime
    show_min = _minutes(show["time"])
    for r in ship_data.list_reservations():
        if r.get("kind") == "dining":
            dining_min = _minutes(r.get("time", "00:00"))
            gap = show_min - dining_min
            if 0 < gap < 90:
                result["conflict_warning"] = (
                    f"Just a heads-up — your dinner at {r.get('restaurant_name', 'the restaurant')} "
                    f"is at {_human_time(r['time'])}, only {gap} minutes before the show. "
                    f"It'll be tight — would you like to adjust dinner time?"
                )
    return result


def _tool_get_excursion(args: Dict[str, Any]) -> Dict[str, Any]:
    name_query = args.get("name") or args.get("excursion") or "snorkel"
    excursion = ship_data.find_excursion(name_query)
    if not excursion:
        return {"card": "error", "error": f"I could not find an excursion matching '{name_query}'."}
    return {
        "card": "excursion",
        "excursion": excursion,
        "time_human": _human_time(excursion["meet_time"]),
    }


def _tool_get_folio(_args: Dict[str, Any]) -> Dict[str, Any]:
    guest = ship_data.get_guest()
    return {
        "card": "folio",
        "guest_name": guest["name"],
        "cabin": guest["cabin"],
        "balance": guest["folio"]["balance"],
        "items": guest["folio"]["items"],
        "drink_package": guest.get("drink_package"),
    }


def _tool_upgrade_drink_package(args: Dict[str, Any]) -> Dict[str, Any]:
    package_query = args.get("package") or "bar-tab-500"
    days_arg = args.get("days")

    pkg = ship_data.find_drink_package(package_query)
    if not pkg:
        return {"card": "error", "error": f"I could not find a drink package called '{package_query}'."}

    days = int(days_arg) if days_arg else ship_data.remaining_cruise_days()
    total = round(pkg["price_per_day"] * days, 2)

    ship_data.set_drink_package(pkg["id"], days, total)
    line_item = ship_data.add_folio_charge(
        f"{pkg['name']} · {days} days @ ${pkg['price_per_day']:.2f}",
        total,
    )
    return {
        "card": "drink_package",
        "package": pkg,
        "days": days,
        "total": total,
        "line_item": line_item,
        "new_balance": ship_data.get_guest()["folio"]["balance"],
    }


def _tool_cancel_reservation(args: Dict[str, Any]) -> Dict[str, Any]:
    query = (args.get("name") or args.get("restaurant") or args.get("show") or "").strip()

    current = ship_data.list_reservations()
    if not current:
        return {
            "card": "error",
            "error": "No reservations are currently booked to cancel.",
        }

    removed = ship_data.remove_reservation(query)
    if not removed:
        booked = [r.get("restaurant_name") or r.get("show_name", "booking") for r in current]
        return {
            "card": "error",
            "error": (
                f"I couldn't find a reservation matching '{query}'. "
                f"Current bookings this session: {', '.join(booked)}."
            ),
        }

    kind = removed.get("kind", "reservation")
    name = removed.get("restaurant_name") or removed.get("show_name") or query
    time = removed.get("time", "")
    return {
        "card": "cancel",
        "kind": kind,
        "name": name,
        "time_human": _human_time(time) if time else "",
        "confirmation_id": removed.get("confirmation_id", ""),
    }


def _tool_switch_reservation(args: Dict[str, Any]) -> Dict[str, Any]:
    """Cancel one reservation and book another in a single tool call.
    Returns the new booking's card so a ShowCard or DiningCard is displayed.
    Attaches 'switched_from' so the finalize pass can confirm both actions.
    """
    cancel_query = (args.get("cancel") or args.get("from_name") or "").strip()
    book_name    = (args.get("to")     or args.get("name")      or "").strip()
    book_type    = (args.get("type")   or "show").lower()
    count        = int(args.get("count") or 2)
    time         = args.get("time", "")
    party_size   = int(args.get("party_size") or 2)

    # Cancel the old reservation first
    removed = ship_data.remove_reservation(cancel_query)

    # Book the replacement
    if book_type == "dining" and time:
        result = _tool_book_dining({"restaurant": book_name, "time": time, "party_size": party_size})
    else:
        result = _tool_book_show({"show": book_name, "count": count})

    # Attach cancelled info so finalize can confirm both
    if removed:
        result["switched_from"] = {
            "name": removed.get("restaurant_name") or removed.get("show_name", "previous booking"),
            "confirmation_id": removed.get("confirmation_id", ""),
        }

    return result


_SPA_MENU = [
    {"keys": ["couples massage", "couples"], "name": "Couples Massage", "price": 289, "duration_min": 50},
    {"keys": ["hot stone 80", "hot stone massage 80", "80 min"], "name": "Hot Stone Massage (80 min)", "price": 199, "duration_min": 80},
    {"keys": ["hot stone", "hot stone massage", "stone massage"], "name": "Hot Stone Massage (50 min)", "price": 149, "duration_min": 50},
    {"keys": ["facial", "relaxation facial"], "name": "Relaxation Facial", "price": 129, "duration_min": 50},
    {"keys": ["thermal", "thermal suite", "thermal pass"], "name": "Thermal Suite Day Pass", "price": 35, "duration_min": 480},
]


def _match_spa_treatment(query: str) -> Optional[Dict[str, Any]]:
    q = query.strip().lower()
    for t in _SPA_MENU:
        if any(k in q or q in k for k in t["keys"]):
            return t
    return None


def _tool_get_my_reservations(_args: Dict[str, Any]) -> Dict[str, Any]:
    raw = ship_data.list_reservations()
    formatted = []
    for r in raw:
        name = (
            r.get("restaurant_name") or r.get("show_name") or
            r.get("treatment_name") or "Reservation"
        )
        time_raw = r.get("time", "")
        time_h = r.get("time_human") or (_human_time(time_raw) if time_raw else "")
        formatted.append({
            "kind": r.get("kind", "other"),
            "name": name,
            "time_human": time_h,
            "confirmation_id": r.get("confirmation_id", ""),
        })
    return {
        "card": "reservations",
        "reservations": formatted,
        "count": len(formatted),
    }


def _tool_book_spa_treatment(args: Dict[str, Any]) -> Dict[str, Any]:
    treatment_query = (args.get("treatment") or args.get("name") or "").strip()
    time = args.get("time", "17:00")

    treatment = _match_spa_treatment(treatment_query)
    if not treatment:
        menu = ", ".join(t["name"] for t in _SPA_MENU)
        return {"card": "error", "error": f"I didn't recognize that treatment. Available: {menu}."}

    # Duplicate guard
    for r in ship_data.list_reservations():
        if r.get("kind") == "spa" and r.get("treatment_name") == treatment["name"]:
            return {
                "card": "error",
                "error": (
                    f"You already have a {treatment['name']} booked at {r.get('time_human', r.get('time', ''))} "
                    f"— confirmation #{r['confirmation_id']}."
                ),
            }

    original = treatment["price"]
    discounted = round(original * 0.90, 2)
    savings = round(original - discounted, 2)
    confirmation_id = f"SPA{abs(hash((treatment['name'], time))) % 100000:05d}"

    ship_data.add_reservation("spa", {
        "treatment_name": treatment["name"],
        "time": time,
        "time_human": _human_time(time),
        "duration_min": treatment["duration_min"],
        "price": discounted,
        "confirmation_id": confirmation_id,
    })
    ship_data.add_folio_charge(f"Redemption Spa — {treatment['name']}", discounted)

    return {
        "card": "spa_booking",
        "treatment": treatment["name"],
        "duration_min": treatment["duration_min"],
        "original_price": original,
        "discounted_price": discounted,
        "savings": savings,
        "time": time,
        "time_human": _human_time(time),
        "location": "Redemption Spa, Decks 5–6",
        "confirmation_id": confirmation_id,
        "vifp_note": f"Always Included Sailor perk — gratuity is on us. (Saved ${savings:.2f})",
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
    }


_weather_cache: Dict[str, Any] = {"ts": 0.0, "data": None}
_WEATHER_TTL = 600  # 10-minute cache


def _wmo_to_condition(code: int) -> str:
    if code == 0: return "Clear sky"
    if code in (1, 2): return "Partly cloudy"
    if code == 3: return "Overcast"
    if code in (51, 53, 55, 61, 63): return "Light rain"
    if code in (65, 80, 81, 82, 95): return "Rain showers"
    if code in (71, 73, 75): return "Snow"
    return "Mixed conditions"


def _wmo_to_icon_key(code: int) -> str:
    if code == 0: return "sunny"
    if code in (1, 2): return "partly_cloudy"
    if code == 3: return "cloudy"
    if code in (51, 53, 55, 61, 63, 65, 80, 81, 82, 95): return "rainy"
    return "cloudy"


def _tool_get_weather(_args: Dict[str, Any]) -> Dict[str, Any]:
    global _weather_cache
    now = _time.time()
    if _weather_cache["data"] and now - _weather_cache["ts"] < _WEATHER_TTL:
        logger.info("Weather cache hit (age %.0fs)", now - _weather_cache["ts"])
        return _weather_cache["data"]

    # Today's port = Puerto Plata, Dominican Republic (~19.79N, -70.69W)
    cruise = ship_data.get_cruise()
    try:
        url = (
            "https://api.open-meteo.com/v1/forecast"
            "?latitude=19.79&longitude=-70.69"
            "&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m,uv_index"
            "&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=America%2FNew_York"
        )
        with httpx.Client(timeout=5) as client:
            r = client.get(url)
            r.raise_for_status()
            c = r.json()["current"]
        port_weather = {
            "temp_f": round(c["temperature_2m"]),
            "wind_mph": round(c["windspeed_10m"]),
            "humidity": c["relative_humidity_2m"],
            "uv_index": round(c.get("uv_index", 7)),
            "condition": _wmo_to_condition(c["weathercode"]),
            "icon_key": _wmo_to_icon_key(c["weathercode"]),
        }
        logger.info("Weather fetched live: %s°F %s", port_weather["temp_f"], port_weather["condition"])
    except Exception as e:
        logger.warning("Weather fetch failed (%s); using fallback", e)
        port_weather = {
            "temp_f": 85, "wind_mph": 9, "humidity": 70, "uv_index": 8,
            "condition": "Sunny", "icon_key": "sunny",
        }

    result = {
        "card": "weather",
        "location": cruise.get("today_label", "Puerto Plata, Dominican Republic"),
        "port_date": f"Today, Day {cruise.get('current_day', 4)} of {cruise.get('total_days', 6)}",
        # Keep 'cozumel' key for backward-compat with frontend card renderer.
        "cozumel": port_weather,
        "onboard": {
            "temp_f": 82,
            "condition": "Partly cloudy",
            "icon_key": "partly_cloudy",
            "sea_state": "Calm (2 ft)",
        },
        "live": True,
    }
    _weather_cache["ts"] = now
    _weather_cache["data"] = result
    return result


def _tool_get_wifi_options(_args: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "topic": "wifi",
        "packages": [
            {"name": "Basic Wi-Fi", "price_per_day": 0, "includes": "Always Included — browsing, messaging, email, social on every device"},
            {"name": "Premium Wi-Fi", "price_per_day": 20, "includes": "Add streaming, Zoom/FaceTime video, and faster speeds across all your devices"},
            {"name": "Mega RockStar", "price_per_day": 0, "includes": "Premium Wi-Fi included with your suite — no purchase needed"},
        ],
        "purchase": "Upgrade in the Sailor App or at any bar — Sailor Services will sort you out.",
    }


def _tool_get_spa_options(_args: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "topic": "spa",
        "location": "Redemption Spa, Decks 5–6",
        "hours": "6 AM – 11:30 PM",
        "services": [
            {"name": "Hot Stone Massage", "duration_min": 50, "price": 149},
            {"name": "Hot Stone Massage", "duration_min": 80, "price": 199},
            {"name": "Couples Massage", "duration_min": 50, "price": 289},
            {"name": "Salt-Stone Facial", "duration_min": 50, "price": 129},
            {"name": "Mud Room Day Pass", "price": 45, "note": "complimentary with any treatment; unlimited for Mega RockStar Sailors"},
        ],
        "vifp_discount": "Always Included — no auto-gratuity, no add-on fees.",
        "booking": "Tap Book in the Sailor App or call ext. 7100",
    }


def _tool_get_ship_info(args: Dict[str, Any]) -> Dict[str, Any]:
    topic = (args.get("topic") or "general").lower()
    info_map = {
        "pool": "The Perch (Deck 16 aft) — sundeck pool with cabanas. Aquatic Club (Deck 7 pool deck) for the main pool action. Both adult-only — the whole ship is.",
        "casino": "The Casino, Deck 6 — open from 8 PM at sea, closed in port. Cocktails on; intimate scale, not a megacasino.",
        "kids": "Honey, this is an adult-only ship — 18 and over. No kids clubs, no family programming. That's by design.",
        "gym": "B-Complex, Deck 5 forward. Three rooms: Build (weights), Bike (spin), Balance (yoga). 6 AM – 11:30 PM. All group classes included.",
        "medical": "Medical Centre, Deck 2 mid-ship. Open 24/7 for emergencies; scheduled hours 8–11 AM and 4–7 PM. Dial ext. 911 for emergencies.",
        "muster": "Muster check-in is done entirely in the Sailor App — no group drill required. Tap 'Muster' before sail-away.",
        "shopping": "Sundries Shop (Deck 5) and the curated High Street boutiques (Deck 7) — open at sea after 6 PM.",
        "dining": "All 20+ venues are included — no covers anywhere. Reservations recommended for specialty (The Wake, Pink Agave, Gunbae, Extra Virgin, Razzle Dazzle, Test Kitchen, Dock House). The Galley food hall is 24-hour walk-up.",
        "photo": "Sailor Snaps, Deck 5. Digital download bundle: $99. Print-on-demand kiosks throughout the ship.",
        "room service": "ShipEats room service: 24/7. Free menu plus à la carte upgrades. Order in the Sailor App or tap the cabin tablet.",
        "manor": "The Manor, Decks 6–7 — two-story nightclub directly inspired by Richard Branson's Virgin Records era. Day lounge, evening cabaret, late-night dance floor.",
        "champagne": "Shake your phone in the Sailor App — secret button appears — Möet & Chandon delivered wherever you are in about 30 minutes. $105/bottle.",
        "scarlet night": "Once per voyage: the whole ship turns RED. Pool-deck takeover, pop-up acts, DJs till late. Dress code: red, non-negotiable. Tomorrow night this sailing.",
        "wifi": "Basic Wi-Fi included for every Sailor. Upgrade to Premium ($20/day) for streaming, Zoom, video calls.",
        "rockstar": "RockStar Quarters = Richard's Rooftop access, in-cabin bar, 24/7 RockStar Agent. Mega RockStar adds unlimited bar tab, unlimited Thermal Suite, included Premium Wi-Fi.",
    }
    for key, val in info_map.items():
        if key in topic:
            return {"topic": topic, "info": val}
    return {"topic": topic, "info": "Sailor Services on Deck 5 (or message us in the app) can help with anything I haven't covered."}


# ─── Tonight's Look: outfit + salon + pre-show drink (multi-tool chain) ──────

_OUTFIT_LOOKBOOK = {
    "scarlet night": [
        {
            "id": "scarlet-statement",
            "name": "Scarlet Statement",
            "description": "Crimson silk slip + bare-shoulder jacket. Gold strappy heel. Hair: sleek bun.",
            "image": "/looks/scarlet-statement.svg",
            "vibe": "Photo-finish red. Made for the pool-deck takeover.",
            "needs": ["blow-out", "smoky-eye"],
        },
        {
            "id": "ruby-tux",
            "name": "Ruby Tuxedo",
            "description": "Tailored red tux + black silk tee + crisp loafers. Optional black bow.",
            "image": "/looks/ruby-tux.svg",
            "vibe": "Branson energy. Late-night Manor approved.",
            "needs": ["trim", "manicure"],
        },
        {
            "id": "after-hours",
            "name": "After-Hours Red",
            "description": "Floor-length scarlet column dress, slit. Drop earrings, gold cuff.",
            "image": "/looks/after-hours.svg",
            "vibe": "Quiet drama. For arriving second, leaving last.",
            "needs": ["updo", "polish"],
        },
    ],
    "manor": [
        {
            "id": "manor-disco",
            "name": "Manor Disco",
            "description": "Metallic mini + ankle boots. Black blazer for the cold deck walk.",
            "image": "/looks/manor-disco.svg",
            "vibe": "Built to dance.",
            "needs": ["blow-out"],
        },
    ],
    "pool day": [
        {
            "id": "pool-rouge",
            "name": "Pool-Deck Rouge",
            "description": "Red one-piece + linen overshirt + woven mules. Straw bag.",
            "image": "/looks/pool-rouge.svg",
            "vibe": "Sunset cocktail at The Perch.",
            "needs": [],
        },
    ],
    "bimini": [
        {
            "id": "bimini-easy",
            "name": "Bimini Easy",
            "description": "Cream linen set + raffia tote + slim-strap sandal.",
            "image": "/looks/bimini-easy.svg",
            "vibe": "Beach-Club-to-cabana smooth.",
            "needs": [],
        },
    ],
}


def _tool_suggest_outfit(args: Dict[str, Any]) -> Dict[str, Any]:
    """Suggest 1–3 looks for tonight's occasion (Scarlet Night, Manor, pool, Bimini)."""
    occasion = (args.get("occasion") or "scarlet night").strip().lower()
    vibe = (args.get("vibe") or "").strip().lower()

    # Fuzzy match
    key = "scarlet night"
    for k in _OUTFIT_LOOKBOOK:
        if k in occasion or occasion in k:
            key = k
            break

    looks = _OUTFIT_LOOKBOOK.get(key, _OUTFIT_LOOKBOOK["scarlet night"])
    # Vibe filter (loose)
    if vibe:
        filtered = [l for l in looks if vibe in l["vibe"].lower() or vibe in l["description"].lower()]
        looks = filtered or looks

    return {
        "card": "outfit_suggestion",
        "occasion": occasion,
        "looks": looks[:3],
        "stylist_note": (
            "Anything here speak to you? I can pre-book a blow-out at the salon and "
            "a Manor table to land your night."
        ),
    }


_SALON_MENU = [
    {"keys": ["blow-out", "blowout", "blow dry", "blow-dry"], "name": "Blow-Out", "price": 65, "duration_min": 45},
    {"keys": ["updo", "up-do", "styling"], "name": "Updo Styling", "price": 95, "duration_min": 60},
    {"keys": ["makeup", "make-up", "smoky-eye", "glam"], "name": "Glam Makeup", "price": 120, "duration_min": 60},
    {"keys": ["manicure", "nails", "polish"], "name": "Express Manicure", "price": 45, "duration_min": 30},
    {"keys": ["trim", "haircut", "men's cut"], "name": "Salon Trim", "price": 55, "duration_min": 30},
]


def _match_salon_service(query: str) -> Optional[Dict[str, Any]]:
    q = (query or "").strip().lower()
    for s in _SALON_MENU:
        if any(k in q or q in k for k in s["keys"]):
            return s
    return None


def _tool_book_salon(args: Dict[str, Any]) -> Dict[str, Any]:
    """Book a salon service at Redemption Spa (Deck 5 salon side).

    Optional `look_id` is folded into the confirmation hash so that booking a
    blow-out for two different looks (Scarlet Statement vs Ruby Tuxedo) yields
    different confirmation numbers — used by the `land_the_look` macro.
    """
    service_query = (args.get("service") or args.get("name") or "").strip()
    time = args.get("time", "17:00")
    look_id = args.get("look_id")  # optional; only set when called from land_the_look

    service = _match_salon_service(service_query)
    if not service:
        menu = ", ".join(s["name"] for s in _SALON_MENU)
        return {"card": "error", "error": f"I didn't recognise that salon service. Try: {menu}."}

    confirmation_id = f"SAL{abs(hash((service['name'], time, look_id))) % 100000:05d}"

    ship_data.add_reservation("salon", {
        "treatment_name": service["name"],
        "time": time,
        "time_human": _human_time(time),
        "duration_min": service["duration_min"],
        "price": service["price"],
        "confirmation_id": confirmation_id,
    })
    ship_data.add_folio_charge(f"Redemption Spa Salon — {service['name']}", service["price"])

    return {
        "card": "salon_booking",
        "service": service["name"],
        "duration_min": service["duration_min"],
        "price": service["price"],
        "time": time,
        "time_human": _human_time(time),
        "location": "Redemption Spa Salon, Deck 5",
        "confirmation_id": confirmation_id,
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
    }


# ─── Tonight's Look — bug fix: macro tool to land the whole look ────────────
# Maps each look's id to (cocktail name, venue, deck, price, vibe-line).
# Genuinely different per look so the 3 outfit choices feel distinct.
_LOOK_COCKTAIL = {
    "scarlet-statement": {
        "drink": "Disco Nap (espresso martini, smoky twist)",
        "venue": "On The Rocks", "deck": 6, "price": 17,
        "vibe": "Sleek silk + gold heels deserves caffeine + crema. You're ready to own the pool deck.",
    },
    "ruby-tux": {
        "drink": "Negroni",
        "venue": "On The Rocks", "deck": 6, "price": 16,
        "vibe": "Sharp suit, sharp drink. Branson energy — exactly the late-night Manor mood.",
    },
    "after-hours": {
        "drink": "Mezcal Mule",
        "venue": "Loose Cannon", "deck": 6, "price": 16,
        "vibe": "Floor-length drama + slow-burn agave. For arriving second and leaving last.",
    },
}

# Display data for outfit_confirmed card (matches frontend lookbook).
_LOOK_DETAILS = {
    "scarlet-statement": {
        "name": "Scarlet Statement", "image": "/looks/scarlet-statement.svg",
        "summary": "Crimson silk slip + bare-shoulder jacket. Gold strappy heel. Hair: sleek bun.",
    },
    "ruby-tux": {
        "name": "Ruby Tuxedo", "image": "/looks/ruby-tux.svg",
        "summary": "Tailored red tux + black silk tee + crisp loafers. Optional black bow.",
    },
    "after-hours": {
        "name": "After-Hours Red", "image": "/looks/after-hours.svg",
        "summary": "Floor-length scarlet column dress, slit. Drop earrings, gold cuff.",
    },
}


# ─── Hangover Saver — one cohesive "Recovery Menu" card ────────────────────
# Per Plan agent: a single well-designed card beats 4 noisy ones. Books two
# real reservations under the hood (hydration drip + late breakfast) so the
# menu items echo into My Reservations + folio.
_RECOVERY_ITEMS = [
    {"icon": "💧", "title": "Hydration drip — Redemption Spa", "detail": "30 min IV vitamin boost · Deck 5", "price": 95, "time": "10:30", "book_as": "spa"},
    {"icon": "🥬", "title": "B-Complex green smoothie — B-Complex gym", "detail": "Ginger, spinach, mango · grab-and-go · Deck 5", "price": 12, "time": "11:00", "book_as": None},
    {"icon": "🍳", "title": "Late breakfast at The Wake", "detail": "Eggs Benedict + bottomless mimosas", "price": 0, "time": "11:30", "book_as": "dining"},
    {"icon": "😎", "title": "Cabana siesta at The Perch", "detail": "Reserved lounger · Deck 16 aft", "price": 25, "time": "13:30", "book_as": None},
]


def _tool_hangover_recovery_menu(_args: Dict[str, Any]) -> Dict[str, Any]:
    """Cheeky adult-only recovery menu — sass + actual bookings."""
    total = sum(item["price"] for item in _RECOVERY_ITEMS)
    conf = f"REC{abs(hash(('recovery', _time.time()))) % 100000:05d}"

    # Real reservations for the bookable items
    ship_data.add_reservation("spa", {
        "treatment_name": "Hydration drip — Redemption Spa",
        "time": "10:30", "time_human": _human_time("10:30"),
        "duration_min": 30, "price": 95,
        "confirmation_id": f"SPA{abs(hash(('hydration', conf))) % 100000:05d}",
    })
    # NOTE: distinct restaurant_id from the real "the-wake" dinner slot so the
    # duplicate-guard in _tool_book_dining doesn't block a later dinner booking.
    ship_data.add_reservation("dining", {
        "restaurant_id": "the-wake-breakfast",
        "restaurant_name": "The Wake (late breakfast)",
        "time": "11:30", "time_human": _human_time("11:30"),
        "party_size": 1,
        "confirmation_id": f"BR{abs(hash(('wake-bf', conf))) % 100000:05d}",
    })
    ship_data.add_folio_charge("Redemption Spa — Hydration drip", 95)
    ship_data.add_folio_charge("The Perch — Reserved lounger", 25)

    return {
        "card": "recovery_menu",
        "title": "Late one, honey?",
        "subtitle": "Ruby's no-judgment recovery menu — sorted.",
        "items": _RECOVERY_ITEMS,
        "confirmation_id": conf,
        "total": total,
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
    }


# ─── Manor Shazam — identify what's playing right now ──────────────────────
# Mocked DJ set list. Picks pseudo-randomly so the demo doesn't repeat.
# Track titles are mentioned in text only — no audio embed (zero IP risk).
_MANOR_TRACKLIST = [
    {"track": "Tubular Bells — Pt. I", "artist": "Mike Oldfield", "year": 1973, "vibe": "Krautrock / prog",
     "trivia": "Virgin Records' very first release — the album that built the label."},
    {"track": "Sledgehammer", "artist": "Peter Gabriel", "year": 1986, "vibe": "Soulful funk-rock",
     "trivia": "Released on Virgin. Stop-motion video changed MTV forever."},
    {"track": "Anarchy in the U.K.", "artist": "Sex Pistols", "year": 1976, "vibe": "Pure punk",
     "trivia": "Branson signed the Pistols after EMI dropped them. The bet of a lifetime."},
    {"track": "Karma Chameleon", "artist": "Culture Club", "year": 1983, "vibe": "Synth-pop",
     "trivia": "Virgin Records UK. Boy George at his peak."},
    {"track": "Don't You Want Me", "artist": "The Human League", "year": 1981, "vibe": "Synth-pop",
     "trivia": "Virgin Records. The Christmas #1 that defined an era."},
    {"track": "Red Red Wine", "artist": "UB40", "year": 1983, "vibe": "Reggae",
     "trivia": "Virgin Records signing. A Neil Diamond cover that nobody saw coming."},
    {"track": "Dance Away", "artist": "Roxy Music", "year": 1979, "vibe": "Art-rock disco",
     "trivia": "Bryan Ferry at his smoothest. Late-Manor energy in song form."},
    {"track": "Le Freak", "artist": "Chic", "year": 1978, "vibe": "Disco",
     "trivia": "Nile Rodgers wrote it after being turned away from Studio 54."},
]


def _tool_identify_now_playing(_args: Dict[str, Any]) -> Dict[str, Any]:
    """Manor Shazam — tap to identify the track + auto-save to Cruise Soundtrack.
    Picks deterministically based on the current minute so two rapid taps don't
    return wildly different results, but rotation feels live over time.
    """
    import datetime as _dt
    idx = (_dt.datetime.now().minute // 6) % len(_MANOR_TRACKLIST)
    pick = _MANOR_TRACKLIST[idx]
    return {
        "card": "now_playing_track",
        "track": pick["track"],
        "artist": pick["artist"],
        "year": pick["year"],
        "vibe": pick["vibe"],
        "venue": "The Manor",
        "deck": 6,
        "trivia": pick["trivia"],
        "added_to_playlist": True,
        "playlist_name": "My Cruise Soundtrack",
        "spotify_search_url": (
            "https://open.spotify.com/search/"
            + (pick["track"] + " " + pick["artist"]).replace(" ", "%20")
        ),
    }


# ─── Recommend a drink right now based on mood + time of day ───────────────
_MOOD_DRINKS = {
    "tired": {
        "drink": "Disco Nap (espresso martini)", "venue": "On The Rocks", "deck": 6, "price": 17,
        "caption": "Late afternoon dip + a long night ahead — caffeine plus crema is the move.",
    },
    "celebratory": {
        "drink": "Krug pour", "venue": "Red Bar (behind The Wake)", "deck": 7, "price": 28,
        "caption": "Toast worthy of the moment. Quiet luxury, served properly.",
    },
    "winding down": {
        "drink": "Smoked Old Fashioned", "venue": "On The Rocks", "deck": 6, "price": 16,
        "caption": "Slow-burn whisky, hint of smoke. For the kind of evening that doesn't need volume.",
    },
    "fired up": {
        "drink": "Mezcal Mule", "venue": "Pink Agave bar", "deck": 5, "price": 17,
        "caption": "Agave with a kick. Pre-Manor accelerator.",
    },
    "fancy": {
        "drink": "French 75", "venue": "Red Bar", "deck": 7, "price": 17,
        "caption": "Gin + champagne. Always the right answer when you're feeling formal.",
    },
}


def _tool_recommend_drink_now(args: Dict[str, Any]) -> Dict[str, Any]:
    """Mood-based 'right-now' cocktail picker. Distinct from
    recommend_pre_show_drink which keys off venue."""
    mood = (args.get("mood") or "celebratory").strip().lower()
    # Fuzzy mood resolution
    for key in _MOOD_DRINKS:
        if key in mood or mood in key:
            mood = key
            break
    pick = _MOOD_DRINKS.get(mood, _MOOD_DRINKS["celebratory"])
    return {
        "card": "drink_pairing",
        "drink": pick["drink"],
        "venue": pick["venue"],
        "deck": pick["deck"],
        "price": pick["price"],
        "note": pick["caption"],
    }


# ─── Surprise Mode — premium romance/celebration macro ─────────────────────
_SURPRISE_PRESETS = {
    "anniversary": {
        "headline": "Anniversary night, sorted.",
        "flowers": {"item": "Long-stem red roses (24)", "price": 110, "location": "your cabin"},
        "restaurant_id": "the-wake",
        "restaurant_name": "The Wake",
        "dinner_time": "20:00",
        "champagne": "Möet & Chandon Impérial (pre-poured table-side)",
        "dessert": "Chocolate Soufflé with your partner's name in chocolate script",
        "extras": "Live cellist for first 15 min · table near the wake windows",
    },
    "birthday": {
        "headline": "Birthday locked in.",
        "flowers": {"item": "Mixed peony bouquet", "price": 95, "location": "your cabin"},
        "restaurant_id": "pink-agave",
        "restaurant_name": "Pink Agave",
        "dinner_time": "20:30",
        "champagne": "Veuve Clicquot Yellow Label",
        "dessert": "Tres Leches with sparkler + name in agave syrup",
        "extras": "Mariachi cameo at 9:15 · mezcal flight comp'd",
    },
    "proposal": {
        "headline": "Question of the year, sorted.",
        "flowers": {"item": "Single white rose + petals path", "price": 140, "location": "your cabin"},
        "restaurant_id": "the-wake",
        "restaurant_name": "The Wake",
        "dinner_time": "19:30",
        "champagne": "Dom Pérignon Vintage",
        "dessert": "Stargazer raspberry tart, served on its own",
        "extras": "Reserved private alcove · photographer on standby · ring kept by RockStar Agent",
    },
}


def _tool_arrange_surprise(args: Dict[str, Any]) -> Dict[str, Any]:
    """Coordinate a 4-touchpoint premium surprise (flowers + dining + champagne
    + dessert). Returns one headline `surprise_summary` card plus the actual
    dining + champagne cards so real reservations + folio updates happen.
    """
    occasion = (args.get("occasion") or "anniversary").strip().lower()
    if "birthday" in occasion: occasion = "birthday"
    elif "propos" in occasion or "engage" in occasion or "ring" in occasion: occasion = "proposal"
    else: occasion = "anniversary"

    recipient = (args.get("recipient") or args.get("partner") or "your partner").strip()
    preset = _SURPRISE_PRESETS[occasion]

    # 1) Flowers — reservation only (no separate card; surfaces in summary)
    flowers_conf = f"FLW{abs(hash(('flowers', occasion, _time.time()))) % 100000:05d}"
    ship_data.add_reservation("flowers", {
        "treatment_name": preset["flowers"]["item"],
        "time": "17:00", "time_human": _human_time("17:00"),
        "price": preset["flowers"]["price"],
        "confirmation_id": flowers_conf,
    })
    ship_data.add_folio_charge(f"Surprise — {preset['flowers']['item']}", preset["flowers"]["price"])

    # 2) Dining — real booking via book_dining
    dining_card = _tool_book_dining({
        "restaurant": preset["restaurant_name"],
        "time": preset["dinner_time"],
        "party_size": 2,
    })

    # 3) Champagne — real booking via order_champagne (delivered table-side)
    champagne_card = _tool_order_champagne({"location": f"your table at {preset['restaurant_name']}"})

    # 4) Surprise summary card — the headline experience
    summary_card = {
        "card": "surprise_summary",
        "occasion": occasion.capitalize(),
        "recipient": recipient,
        "headline": preset["headline"],
        "flowers": preset["flowers"],
        "restaurant": preset["restaurant_name"],
        "dinner_time_human": _human_time(preset["dinner_time"]),
        "champagne": preset["champagne"],
        "dessert": preset["dessert"],
        "extras": preset["extras"],
        "confirmation_id": f"SURP{abs(hash(('surprise', occasion, _time.time()))) % 100000:05d}",
    }

    # Surprise booking marker (so it shows in My Reservations as a coordinated event)
    ship_data.add_reservation("surprise", {
        "treatment_name": f"{occasion.capitalize()} surprise for {recipient}",
        "time": preset["dinner_time"], "time_human": _human_time(preset["dinner_time"]),
        "confirmation_id": summary_card["confirmation_id"],
    })

    return {
        "occasion": occasion,
        "recipient": recipient,
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
        "cards": [summary_card, dining_card, champagne_card],
    }


# ─── Pre-Boarder for Bimini — port-day automation macro ────────────────────
def _tool_prebook_bimini_day(args: Dict[str, Any]) -> Dict[str, Any]:
    """Pre-stage a full day at the Beach Club at Bimini: cabana + lunch slot +
    sunset cocktail + departure reminder. Returns a port_day_plan summary card
    plus the real cabana excursion + lunch dining + cocktail pairing cards.
    """
    cabana_tier = (args.get("cabana_tier") or "private").strip().lower()
    lunch_time = (args.get("lunch_time") or "13:00").strip()
    party_size = int(args.get("party_size") or 2)

    # Cabana — use the existing Bimini cabana excursion (matches data file)
    excursion = ship_data.find_excursion("bimini-cabana") or ship_data.find_excursion("bimini-beach-club")
    excursion_card = None
    if excursion:
        conf = f"EXC{abs(hash(('bimini-cabana', _time.time()))) % 100000:05d}"
        ship_data.add_reservation("excursion", {
            "excursion_id": excursion["id"],
            "excursion_name": excursion["name"],
            "treatment_name": excursion["name"],
            "time": excursion.get("meet_time", "10:00"),
            "time_human": _human_time(excursion.get("meet_time", "10:00")),
            "party_size": party_size,
            "price": excursion.get("price_per_guest", 0),
            "confirmation_id": conf,
        })
        if excursion.get("price_per_guest", 0) > 0:
            ship_data.add_folio_charge(
                f"{excursion['name']} (×{party_size})",
                excursion["price_per_guest"] * party_size,
            )
        excursion_card = {
            "card": "excursion",
            "excursion": excursion,
            "time_human": _human_time(excursion.get("meet_time", "10:00")),
            "party_size": party_size,
            "confirmation_id": conf,
        }

    # Lunch — Beach Club buffet (mocked as a dining reservation)
    lunch_conf = f"LUN{abs(hash(('bimini-lunch', lunch_time))) % 100000:05d}"
    ship_data.add_reservation("dining", {
        "restaurant_id": "bimini-beach-club-lunch",
        "restaurant_name": "Beach Club lunch buffet",
        "time": lunch_time, "time_human": _human_time(lunch_time),
        "party_size": party_size,
        "confirmation_id": lunch_conf,
    })
    lunch_card = {
        "card": "dining",
        "restaurant": {
            "name": "Beach Club lunch buffet",
            "cuisine": "Beach Club buffet — included",
            "location": "Bimini Beach Club, beachside pavilion",
            "headline_dish": "Conch fritters, jerk chicken, fresh ceviche",
            "cover_charge": 0,
        },
        "time": lunch_time, "time_human": _human_time(lunch_time),
        "date": _cruise_date(1),  # tomorrow if Bimini is next port
        "party_size": party_size,
        "confirmation_id": lunch_conf,
    }

    # Sunset cocktail — drink_pairing card pre-staged for ~18:30
    cocktail_card = {
        "card": "drink_pairing",
        "drink": "Bimini Punch (rum, passionfruit, mint)",
        "venue": "Beach Club Beach Bar",
        "deck": 0,
        "price": 16,
        "note": "Waiting for you at 6:30 PM. Last call before the tender back.",
    }

    # Port-day plan summary (lead card)
    plan_card = {
        "card": "port_day_plan",
        "port": "Bimini, Bahamas",
        "weather": {"temp_f": 84, "condition": "Sunny", "uv": 9, "sea_state": "Glass calm"},
        "cabana_tier": cabana_tier,
        "party_size": party_size,
        "agenda": [
            {"time": "09:30", "what": "Tender from ship to Beach Club"},
            {"time": "10:00", "what": "Cabana check-in + cold towels"},
            {"time": (lunch_time), "what": "Beach Club lunch buffet"},
            {"time": "14:30", "what": "Pool volleyball / DJ takeover"},
            {"time": "18:30", "what": "Sunset cocktail at the Beach Bar"},
            {"time": "20:00", "what": "Last tender back — don't miss it"},
        ],
        "confirmation_id": f"BIM{abs(hash(('bimini-day', _time.time()))) % 100000:05d}",
    }

    # Port-day-plan reservation marker
    ship_data.add_reservation("port_day_plan", {
        "treatment_name": "Bimini Beach Club — full day plan",
        "time": "09:30", "time_human": "9:30 AM",
        "confirmation_id": plan_card["confirmation_id"],
    })

    cards = [plan_card]
    if excursion_card: cards.append(excursion_card)
    cards.append(lunch_card)
    cards.append(cocktail_card)

    return {
        "port": "Bimini, Bahamas",
        "party_size": party_size,
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
        "cards": cards,
    }


# ─── Pack Forecaster — AI-tailored packing list for the voyage ─────────────
def _tool_generate_packing_list(args: Dict[str, Any]) -> Dict[str, Any]:
    """Tailored packing list — adult-only, no formal night, RED for Scarlet
    Night, swimwear for Bimini, no kid gear."""
    occasion = (args.get("occasion") or "voyage").strip().lower()
    cruise = ship_data.get_cruise()
    sections = [
        {
            "title": "🔴 Scarlet Night — required",
            "subtitle": "Tomorrow. Red is non-negotiable.",
            "items": [
                {"name": "Red dress / red suit / red blouse + skirt", "tag": "essential"},
                {"name": "Bold red lip or red accessory", "tag": "recommended"},
                {"name": "Comfortable dance shoes — pool deck takeover", "tag": "essential"},
                {"name": "Sequins / metallics that catch the red lights", "tag": "optional"},
            ],
        },
        {
            "title": "🏝 Bimini Beach Club",
            "subtitle": "Day at the private beach.",
            "items": [
                {"name": "Swimwear (2-3 sets, rotate to dry)", "tag": "essential"},
                {"name": "Linen overshirt / cover-up", "tag": "essential"},
                {"name": "Reef-safe sunscreen SPF 50+", "tag": "essential"},
                {"name": "Wide-brim hat", "tag": "recommended"},
                {"name": "Slim-strap sandals or pool slides", "tag": "essential"},
                {"name": "Light beach tote (raffia or canvas)", "tag": "recommended"},
            ],
        },
        {
            "title": "🎶 The Manor late-night",
            "subtitle": "Two-story nightclub. Built to dance.",
            "items": [
                {"name": "1-2 going-out outfits (sleek, room to move)", "tag": "essential"},
                {"name": "Comfortable heels OR sharp sneakers — your call", "tag": "essential"},
                {"name": "Small crossbody bag", "tag": "recommended"},
                {"name": "Light layer for the deck walk back", "tag": "optional"},
            ],
        },
        {
            "title": "💆 Spa & wellness",
            "subtitle": "Redemption Spa + B-Complex gym.",
            "items": [
                {"name": "Activewear for group fitness classes", "tag": "recommended"},
                {"name": "Flip-flops for the Mud Room", "tag": "essential"},
                {"name": "Hair tie + claw clip for spa/gym", "tag": "essential"},
                {"name": "Plain swimsuit for hydrotherapy pool", "tag": "recommended"},
            ],
        },
        {
            "title": "👗 Daily casuals",
            "subtitle": "Smart-casual everywhere — no tie, no formal night.",
            "items": [
                {"name": "5 day outfits (light layers, breathable)", "tag": "essential"},
                {"name": "1-2 dinner outfits (no formal needed)", "tag": "essential"},
                {"name": "Comfortable walking shoes", "tag": "essential"},
                {"name": "Sunglasses + reading glasses", "tag": "recommended"},
            ],
        },
        {
            "title": "📱 Tech & docs",
            "subtitle": "What you'll actually use.",
            "items": [
                {"name": "Phone (Sailor App = your room key, muster, payments)", "tag": "essential"},
                {"name": "Portable charger", "tag": "recommended"},
                {"name": "Passport / ID — soft copy in phone + paper backup", "tag": "essential"},
                {"name": "Travel insurance card", "tag": "optional"},
            ],
        },
    ]
    return {
        "card": "packing_list",
        "title": "Your Scarlet Lady packing list",
        "subtitle": f"Tailored for the {cruise.get('itinerary_name', 'voyage')} — no formal nights, kids-free, RED required for Scarlet Night.",
        "ship": cruise.get("ship", "Scarlet Lady"),
        "sections": sections,
    }


# ─── Voyage Diary — aggregate today's moments from reservations + folio ────
def _tool_get_voyage_diary(args: Dict[str, Any]) -> Dict[str, Any]:
    """Per-day visual recap. Aggregates real bookings + folio items by date,
    adds mocked photo count + music plays, returns a stylized diary card."""
    day_arg = args.get("day")
    cruise = ship_data.get_cruise()
    guest = ship_data.get_guest()
    current_day = cruise.get("current_day", 4)
    try:
        day = int(day_arg) if day_arg is not None else current_day
    except (TypeError, ValueError):
        day = current_day
    day = max(1, min(day, cruise.get("total_days", 6)))

    itinerary = cruise.get("itinerary", [])
    day_label = itinerary[day - 1] if day - 1 < len(itinerary) else "At Sea"
    day_date = _cruise_date(day - 1)

    folio_today = [it for it in guest.get("folio", {}).get("items", []) if it.get("date") == day_date]
    reservations = guest.get("reservations", [])
    res_names = [
        r.get("restaurant_name") or r.get("show_name") or r.get("treatment_name") or "Reservation"
        for r in reservations
    ]

    # Mocked colour: photo count + music plays based on a deterministic-ish hash of the day
    photos = 8 + (day * 3) % 15
    plays = 6 + (day * 5) % 11

    # Bullet list of moments
    moments = []
    for it in folio_today[:6]:
        moments.append({"icon": "💳", "label": it.get("desc", ""), "value": f"${it.get('amount', 0):.2f}"})
    for r in reservations[:6]:
        nm = r.get("restaurant_name") or r.get("show_name") or r.get("treatment_name") or "Reservation"
        t = r.get("time_human") or r.get("time") or ""
        moments.append({"icon": "📌", "label": nm, "value": t})
    if photos:
        moments.append({"icon": "📸", "label": "Photos taken", "value": str(photos)})
    if plays:
        moments.append({"icon": "🎧", "label": "Tracks ID'd at The Manor", "value": str(plays)})
    if not moments:
        moments.append({"icon": "✨", "label": "A quiet chapter — sometimes the best kind.", "value": ""})

    # Header SVG per day (rotates through 5 day SVGs)
    header_svg = f"/diary/day-{((day - 1) % 5) + 1}.svg"

    return {
        "card": "voyage_diary",
        "day_label": f"Day {day} of {cruise.get('total_days', 6)} · {day_label}",
        "title": f"Today's chapter — {guest.get('primary_first_name', 'Sailor')}",
        "ship": cruise.get("ship", "Scarlet Lady"),
        "moments": moments,
        "stats": {
            "venues": len(set(r.get("restaurant_name") for r in reservations if r.get("restaurant_name"))),
            "photos": photos,
            "music_plays": plays,
            "folio_today": round(sum(it.get("amount", 0) for it in folio_today), 2),
        },
        "header_image": header_svg,
        "shareable_footer": "Tap to share your Scarlet Lady chapter →",
    }


# ─── Scarlet Night Squad Mode — cosmetic group coordination ────────────────
_SQUAD_MOCK_INVITEES = ["Lisa P.", "Marcus T.", "Priya R.", "Andre J.", "Sofia M.", "Wei C."]


def _tool_create_squad_event(args: Dict[str, Any]) -> Dict[str, Any]:
    """Cosmetic-only — single squad_event card showing coordinated salon + Manor
    table for a group. Does NOT insert per-member reservations (we don't have a
    multi-guest data model yet). This is a demo moment, not a real coordination."""
    party_size = int(args.get("party_size") or 4)
    party_size = max(2, min(party_size, 8))
    invitees = _SQUAD_MOCK_INVITEES[: max(0, party_size - 1)]
    conf = f"SQD{abs(hash(('squad', _time.time()))) % 100000:05d}"

    # Add a single squad_event reservation so it shows in My Reservations
    ship_data.add_reservation("squad_event", {
        "treatment_name": f"Scarlet Night squad for {party_size}",
        "time": "23:00", "time_human": _human_time("23:00"),
        "confirmation_id": conf,
    })

    return {
        "card": "squad_event",
        "occasion": "Scarlet Night",
        "party_size": party_size,
        "invitees": invitees,
        "salon_window": "7:00 PM – 8:00 PM at Redemption Spa",
        "manor_table_time": "11:00 PM",
        "manor_table_label": f"Group table for {party_size}",
        "rendezvous": "Meet at On The Rocks (Deck 6) at 10:30 for a pre-toast",
        "confirmation_id": conf,
        "share_link": f"https://sailor.virginvoyages.com/squad/{conf}",
    }


def _tool_land_the_look(args: Dict[str, Any]) -> Dict[str, Any]:
    """Macro: confirm the chosen look + book salon + reserve Manor table + pair
    a cocktail — returned as 4 cards in one turn. Look-specific cocktail and
    salon confirmation IDs so each look feels distinct.
    """
    raw = (args.get("look_id") or args.get("look") or "scarlet-statement").strip().lower()
    # Fuzzy resolution — tolerate slugs, human names, and trailing descriptors.
    # Normalise spaces↔hyphens, then try several reductions.
    def _resolve(s: str) -> Optional[str]:
        if s in _LOOK_DETAILS:
            return s
        slug = s.replace(" ", "-")
        if slug in _LOOK_DETAILS:
            return slug
        # Substring match against canonical IDs and human names
        for canonical, details in _LOOK_DETAILS.items():
            name_slug = details["name"].lower().replace(" ", "-")
            if slug == name_slug or slug in canonical or canonical in slug or name_slug in slug or slug in name_slug:
                return canonical
        # Keyword-based fallback
        if "scarlet" in s or "statement" in s: return "scarlet-statement"
        if "ruby" in s or "tux" in s:          return "ruby-tux"
        if "after" in s or "column" in s:      return "after-hours"
        return None

    look_id = _resolve(raw)
    if look_id is None:
        return {"card": "error", "error": f"I don't know the '{raw}' look. Try Scarlet Statement, Ruby Tuxedo, or After-Hours Red."}

    salon_time = (args.get("salon_time") or "19:00").strip()
    manor_time = (args.get("manor_time") or "23:00").strip()
    party_size = int(args.get("party_size") or 2)

    look = _LOOK_DETAILS[look_id]
    pairing = _LOOK_COCKTAIL[look_id]

    # 1) outfit_confirmed — record the choice as a reservation so it shows in My Reservations
    outfit_conf = f"OUT{abs(hash((look_id, salon_time))) % 100000:05d}"
    ship_data.add_reservation("outfit", {
        "treatment_name": f"Tonight's Look — {look['name']}",
        "look_id": look_id,
        "time": manor_time,
        "time_human": _human_time(manor_time),
        "confirmation_id": outfit_conf,
    })
    outfit_card = {
        "card": "outfit_confirmed",
        "look_id": look_id,
        "look_name": look["name"],
        "image": look["image"],
        "summary": look["summary"],
        "vibe": pairing["vibe"],
        "occasion": "Scarlet Night",
        "confirmation_id": outfit_conf,
    }

    # 2) salon_booking — blow-out (sensible default for every look)
    salon_card = _tool_book_salon({
        "service": "blow-out",
        "time": salon_time,
        "look_id": look_id,  # makes confirmation unique per look
    })

    # 3) manor_table — new reservation kind
    manor_conf = f"MAN{abs(hash((look_id, manor_time, party_size))) % 100000:05d}"
    ship_data.add_reservation("manor_table", {
        "treatment_name": f"The Manor table for {party_size}",
        "venue": "The Manor",
        "deck": 6,
        "time": manor_time,
        "time_human": _human_time(manor_time),
        "party_size": party_size,
        "confirmation_id": manor_conf,
    })
    manor_card = {
        "card": "manor_table",
        "venue": "The Manor",
        "deck": 6,
        "time": manor_time,
        "time_human": _human_time(manor_time),
        "party_size": party_size,
        "confirmation_id": manor_conf,
        "note": "Reserved table near the dance floor. Your name's at the door.",
    }

    # 4) drink_pairing — look-specific cocktail (reuses existing card type)
    drink_card = {
        "card": "drink_pairing",
        "drink": pairing["drink"],
        "venue": pairing["venue"],
        "deck": pairing["deck"],
        "price": pairing["price"],
        "note": f"Pre-Manor sip — {pairing['vibe']}",
    }

    return {
        # Top-level fields are read by _natural_reply_for and the system for context
        "look_id": look_id,
        "look_name": look["name"],
        "salon_time_human": _human_time(salon_time),
        "manor_time_human": _human_time(manor_time),
        "cocktail": pairing["drink"],
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
        # The 4-card multi-card response
        "cards": [outfit_card, salon_card, manor_card, drink_card],
    }


_DRINK_PAIRING = {
    "the manor":   {"name": "Negroni Bianco",      "venue": "The Manor",      "deck": 6, "price": 16},
    "manor":       {"name": "Negroni Bianco",      "venue": "The Manor",      "deck": 6, "price": 16},
    "on the rocks":{"name": "Smoked Old Fashioned","venue": "On The Rocks",   "deck": 6, "price": 16},
    "red room":    {"name": "French 75",           "venue": "Red Bar",        "deck": 7, "price": 17},
    "loose cannon":{"name": "Dirty Vesper",        "venue": "Loose Cannon",   "deck": 6, "price": 15},
    "pink agave":  {"name": "Smoked Mezcal Sour",  "venue": "Pink Agave bar", "deck": 5, "price": 17},
    "the wake":    {"name": "Krug pour",           "venue": "Red Bar",        "deck": 7, "price": 28},
}


def _tool_recommend_pre_show_drink(args: Dict[str, Any]) -> Dict[str, Any]:
    """Recommend a single cocktail + venue to pair with tonight's plan."""
    venue_query = (args.get("venue") or "the manor").strip().lower()
    pick = None
    for k, v in _DRINK_PAIRING.items():
        if k in venue_query or venue_query in k:
            pick = v
            break
    pick = pick or _DRINK_PAIRING["the manor"]

    return {
        "card": "drink_pairing",
        "drink": pick["name"],
        "venue": pick["venue"],
        "deck": pick["deck"],
        "price": pick["price"],
        "note": "Optional — sip first, then the show.",
    }


def _tool_order_champagne(args: Dict[str, Any]) -> Dict[str, Any]:
    """Shake-for-Champagne — Möet & Chandon Impérial 750ml delivered to a location.

    Virgin's signature ritual. Mock delivery: bottle dispatched from On The Rocks
    (Deck 6), tracked via the Sailor App, ~30 min ETA. $105 to the folio.
    """
    guest = ship_data.get_guest()
    location = (args.get("location") or "").strip()
    if not location:
        location = f"Cabin {guest.get('cabin', '')} · Deck {guest.get('deck', '')}".strip(" ·")
    location = location or "your current location"

    # ETA is calibrated to feel cinematic but plausible.
    eta_minutes = 7
    confirmation_id = f"CH{abs(hash((location, _time.time()))) % 100000:05d}"
    bottle_price = 105.00

    ship_data.add_folio_charge(
        f"Möet & Chandon Impérial 750ml — delivered to {location}",
        bottle_price,
    )

    return {
        "card": "champagne",
        "bottle": "Möet & Chandon Impérial",
        "volume_ml": 750,
        "price": bottle_price,
        "location": location,
        "dispatched_from": "On The Rocks bar, Deck 6",
        "eta_minutes": eta_minutes,
        "deck_path": [6, 5, 4, guest.get("deck", 8)],  # rough route for the tracker
        "confirmation_id": confirmation_id,
        "includes": ["chilled red Virgin ice bucket", "2 champagne flutes"],
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
    }


def _tool_modify_dining(args: Dict[str, Any]) -> Dict[str, Any]:
    restaurant_query = (args.get("restaurant") or args.get("name") or "").strip()
    new_time = (args.get("new_time") or args.get("time") or "").strip()
    new_party_size = int(args.get("new_party_size") or args.get("party_size") or 0) or None

    if not restaurant_query or not new_time:
        return {"card": "error", "error": "I need the restaurant name and the new time to make the change."}

    changed = ship_data.modify_reservation(restaurant_query, new_time, new_party_size)
    if not changed:
        dining = [r.get("restaurant_name", "") for r in ship_data.list_reservations() if r.get("kind") == "dining"]
        if not dining:
            return {"card": "error", "error": "You don't have any dining reservations to modify."}
        return {
            "card": "error",
            "error": f"I couldn't find a '{restaurant_query}' dining reservation. Your current bookings: {', '.join(dining)}.",
        }

    restaurant = ship_data.find_restaurant(changed["restaurant_name"])
    return {
        "card": "dining",
        "restaurant": {
            "name": changed["restaurant_name"],
            "cuisine": restaurant.get("cuisine", "") if restaurant else "",
            "location": restaurant.get("location", "") if restaurant else "",
            "headline_dish": restaurant.get("headline_dish") if restaurant else None,
            "cover_charge": restaurant.get("cover_charge", 0) if restaurant else 0,
        },
        "time": new_time,
        "time_human": _human_time(new_time),
        "date": _today_date(),
        "party_size": changed["party_size"],
        "confirmation_id": changed["confirmation_id"],
        "modified": True,
        "old_time": changed["old_time"],
        "old_time_human": _human_time(changed["old_time"]),
    }


def _minutes(hhmm: str) -> int:
    try:
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return 0


def _natural_reply_for(tool_name: str, tool_result: Dict[str, Any]) -> str:
    """Deterministic, tool-result-driven natural-language reply.

    Used when the LLM finalize pass returns meta-reasoning ("We need to...")
    instead of an actual guest-facing sentence. gpt-oss's harmony channel can
    leak its analysis into the content channel; this is the ground-truth
    fallback so the avatar always voices something sensible.
    """
    if tool_name == "book_dining":
        r = tool_result.get("restaurant", {}) or {}
        return f"You're set for {tool_result.get('time_human', '')} at {r.get('name', 'that restaurant')} — I added it to your day."
    if tool_name == "book_show":
        s = tool_result.get("show", {}) or {}
        return f"Two seats together at {s.get('name', 'the show')}, {tool_result.get('time_human', '')} — tickets are on your phone."
    if tool_name == "get_excursion":
        e = tool_result.get("excursion", {}) or {}
        return f"Meet at {tool_result.get('time_human', '')} at {e.get('meet_location', 'the gangway')}."
    if tool_name == "get_folio":
        return f"Your current folio is ${tool_result.get('balance', 0):.2f} — happy to walk you through the line items."
    if tool_name == "upgrade_drink_package":
        p = tool_result.get("package", {}) or {}
        return (
            f"{p.get('name', 'Bar Tab')} is loaded for {tool_result.get('days', '')} days "
            f"— ${tool_result.get('total', 0):.2f} on your onboard account."
        )
    if tool_name == "cancel_reservation":
        name = tool_result.get("name", "your reservation")
        time_human = tool_result.get("time_human", "")
        suffix = f" at {time_human}" if time_human else ""
        return f"Done — your {name}{suffix} reservation has been cancelled. Let me know if you'd like to rebook."
    if tool_name == "switch_reservation":
        s = tool_result.get("show", {}) or {}
        sf = tool_result.get("switched_from", {}) or {}
        old = sf.get("name", "previous booking")
        new = s.get("name", "the new show")
        return f"All switched — {old} cancelled and {new} booked for {tool_result.get('time_human', '')}."
    if tool_name == "get_my_reservations":
        count = tool_result.get("count", 0)
        if count == 0:
            return "You don't have any reservations booked this session yet — just let me know what you'd like!"
        return f"You have {count} active reservation(s) this session — shown on your card below."
    if tool_name == "book_spa_treatment":
        t = tool_result.get("treatment", "treatment")
        time_h = tool_result.get("time_human", "")
        return (
            f"You're booked, honey — {t} at {time_h} at Redemption Spa. "
            f"Confirmation #{tool_result.get('confirmation_id', '')}."
        )
    if tool_name == "modify_dining":
        r = tool_result.get("restaurant", {}) or {}
        old_h = tool_result.get("old_time_human", "")
        new_h = tool_result.get("time_human", "")
        return (
            f"Done — your {r.get('name', 'dinner')} reservation has been moved "
            f"from {old_h} to {new_h}. Same confirmation number, #{tool_result.get('confirmation_id', '')}."
        )
    if tool_name == "get_today_schedule":
        port = (tool_result.get("next_port") or {}).get("name", "the next port")
        day = tool_result.get("day_label", "today")
        return f"It's {day} — Booked! at 7, Persephone at 9, The Manor going late. {port} tomorrow."
    if tool_name == "order_champagne":
        loc = tool_result.get("location", "your location")
        eta = tool_result.get("eta_minutes", 7)
        return f"Möet & Chandon Impérial on the way to {loc}. About {eta} minutes — track it in the app, honey."
    if tool_name == "suggest_outfit":
        looks = tool_result.get("looks", [])
        if not looks:
            return "Pulled a few looks for you — pick one and I'll sort the rest."
        names = ", ".join(l["name"] for l in looks)
        return f"Three looks: {names}. Tell me which speaks to you — I'll book the salon and a Manor table to land it."
    if tool_name == "book_salon":
        s = tool_result.get("service", "service")
        t = tool_result.get("time_human", "")
        return f"{s} at {t} at the Redemption salon — done. Confirmation #{tool_result.get('confirmation_id', '')}."
    if tool_name == "recommend_pre_show_drink":
        d = tool_result.get("drink", "a cocktail")
        v = tool_result.get("venue", "the bar")
        return f"{d} at {v} — that's the move. Want me to set a table?"
    if tool_name == "land_the_look":
        ln = tool_result.get("look_name", "your look")
        st = tool_result.get("salon_time_human", "")
        mt = tool_result.get("manor_time_human", "")
        ck = tool_result.get("cocktail", "a cocktail")
        return (
            f"Locked in for Scarlet Night: {ln}, blow-out at {st}, Manor table at {mt}, "
            f"and a {ck} waiting before you head in. You're sorted, honey."
        )
    if tool_name == "hangover_recovery_menu":
        return (
            "Late one, honey? Recovery menu sorted — hydration drip at Redemption at 10:30, "
            "green smoothie when you wake, late breakfast at The Wake at 11:30, and a cabana siesta "
            "to seal it. You'll be vertical by sunset."
        )
    if tool_name == "identify_now_playing":
        t = tool_result.get("track", "that track")
        a = tool_result.get("artist", "")
        return f"That's '{t}' by {a} — added to your Cruise Soundtrack on Spotify. Branson story behind it on the card."
    if tool_name == "recommend_drink_now":
        d = tool_result.get("drink", "a cocktail")
        v = tool_result.get("venue", "the bar")
        return f"{d} at {v} — that's the answer, honey."
    if tool_name == "arrange_surprise":
        occ = tool_result.get("occasion", "surprise")
        who = tool_result.get("recipient", "your partner")
        return f"Sorted, honey — {occ} for {who} is on. Flowers waiting in the cabin, table booked, bubbles on the way."
    if tool_name == "prebook_bimini_day":
        return (
            "Tomorrow at Bimini: cabana check-in at 10, lunch at 1, sunset cocktail at 6:30, "
            "last tender at 8. Sun's out, UV is high — pack the SPF."
        )
    if tool_name == "generate_packing_list":
        sec_count = len(tool_result.get("sections", []))
        return f"Packing list pulled — {sec_count} sections, RED flagged for Scarlet Night. No formal wear needed, kids-free, obviously."
    if tool_name == "get_voyage_diary":
        dl = tool_result.get("day_label", "today")
        return f"Here's {dl} — your moments, your photos, your tracks at The Manor. Shareable when you're ready."
    if tool_name == "create_squad_event":
        ps = tool_result.get("party_size", 4)
        return f"Squad of {ps} sorted for Scarlet Night — coordinated salon slots, Manor table at 11, pre-toast at On The Rocks. Share link in the card."
    return "Done — anything else?"


def _assemble_card_payload(tool_result: Dict[str, Any]):
    """Build the `card_payload` returned to the frontend from a tool's result.

    Three shapes are supported (precedence order, top wins):
      1. Macro tools — `{"cards": [card_dict, card_dict, ...]}` returns the list
         as-is (frontend ConciergeCard already renders arrays). Macro tools that
         want a cancel card must include it themselves in `cards`.
      2. switch_reservation — single-tool result that also carries
         `switched_from` metadata: synthesise a 2-element [cancel, new] array.
      3. Plain single card — `{"card": "...", ...}` — pass through.
      4. Info-only tools (no `card` key) — return None so no UI card renders.
    """
    if not tool_result:
        return None
    cards = tool_result.get("cards")
    if isinstance(cards, list) and cards:
        return cards
    if tool_result.get("switched_from") and tool_result.get("card"):
        sf = tool_result["switched_from"]
        cancel_card = {
            "card": "cancel",
            "name": sf.get("name", "previous booking"),
            "confirmation_id": sf.get("confirmation_id", ""),
            "time_human": "",
        }
        return [cancel_card, tool_result]
    if tool_result.get("card"):
        return tool_result
    return None


def _looks_like_reasoning_leak(text: str) -> bool:
    """Detect obviously garbled output (rare on Claude but kept as safety net)."""
    if not text or len(text.strip()) < 5:
        return True
    garbled = re.compile(r"^\s*(tool:|result:|json:|```)", re.IGNORECASE)
    return bool(garbled.match(text.strip()))


def _strip_markdown(text: str) -> str:
    """Remove markdown formatting so plain text is returned to the guest UI."""
    # Remove bold/italic markers: **text**, *text*, __text__, _text_
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text, flags=re.DOTALL)
    text = re.sub(r'\*(.+?)\*', r'\1', text, flags=re.DOTALL)
    text = re.sub(r'__(.+?)__', r'\1', text, flags=re.DOTALL)
    text = re.sub(r'_(.+?)_', r'\1', text, flags=re.DOTALL)
    # Remove inline code backticks
    text = re.sub(r'`(.+?)`', r'\1', text)
    # Remove ATX headings (## Heading → Heading)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Remove leading "> " blockquotes
    text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)
    return text.strip()


def _human_time(hhmm: str) -> str:
    try:
        h, m = hhmm.split(":")
        h_i = int(h)
        suffix = "AM" if h_i < 12 else "PM"
        h_12 = h_i if 1 <= h_i <= 12 else (h_i - 12 if h_i > 12 else 12)
        return f"{h_12}:{m} {suffix}"
    except Exception:
        return hhmm


# ---------------------------------------------------------------------------
# Tool registry
# ---------------------------------------------------------------------------

ToolFn = Callable[[Dict[str, Any]], Dict[str, Any]]

_TOOLS: Dict[str, ToolFn] = {
    "get_today_schedule": _tool_get_today_schedule,
    "book_dining": _tool_book_dining,
    "book_show": _tool_book_show,
    "cancel_reservation": _tool_cancel_reservation,
    "switch_reservation": _tool_switch_reservation,
    "get_my_reservations": _tool_get_my_reservations,
    "book_spa_treatment": _tool_book_spa_treatment,
    "modify_dining": _tool_modify_dining,
    "get_excursion": _tool_get_excursion,
    "get_folio": _tool_get_folio,
    "upgrade_drink_package": _tool_upgrade_drink_package,
    "get_weather": _tool_get_weather,
    "get_wifi_options": _tool_get_wifi_options,
    "get_spa_options": _tool_get_spa_options,
    "get_ship_info": _tool_get_ship_info,
    "order_champagne": _tool_order_champagne,
    "suggest_outfit": _tool_suggest_outfit,
    "book_salon": _tool_book_salon,
    "recommend_pre_show_drink": _tool_recommend_pre_show_drink,
    "land_the_look": _tool_land_the_look,
    "hangover_recovery_menu": _tool_hangover_recovery_menu,
    "identify_now_playing": _tool_identify_now_playing,
    "recommend_drink_now": _tool_recommend_drink_now,
    "arrange_surprise": _tool_arrange_surprise,
    "prebook_bimini_day": _tool_prebook_bimini_day,
    "generate_packing_list": _tool_generate_packing_list,
    "get_voyage_diary": _tool_get_voyage_diary,
    "create_squad_event": _tool_create_squad_event,
}


_STATIC_KNOWLEDGE = """
=== VIRGIN VOYAGES — SCARLET LADY — CONCIERGE KNOWLEDGE BASE ===

VOYAGE
  Ship: Scarlet Lady | 5-Night Western Caribbean Charm | Adult-only (18+)
  Departure: PortMiami, FL — Saturday | Return: Thursday
  Today: Day 4 of 6 — Puerto Plata, Dominican Republic (port day)
  Tomorrow (Day 5): Sea Day — SCARLET NIGHT (ship-wide all-red party)
  Itinerary: PortMiami → Bimini Beach Club → Sea Day → Puerto Plata → Sea Day (Scarlet Night) → PortMiami

GUEST
  (see dynamic session state below — Sailor name, cabin tier, folio, bookings)

DINING — 8 specialty restaurants, ALL INCLUDED (no cover charges)
  No buffet, no main dining room. Every venue is curated. Reservations recommended.
  The Wake | Deck 7 aft | Steak & Seafood | Signature: dry-aged ribeye with bordelaise
    Slots: 17:30 18:00 18:30 19:30 20:00 20:30 21:00
  Pink Agave | Deck 5 mid | Modern Mexican | Tableside guacamole + mezcal flight
    Slots: 17:30 18:00 18:30 19:00 19:30 20:00 21:00 21:30
  Gunbae | Deck 6 mid | Korean BBQ | Wagyu short rib + interactive soju games
    Slots: 17:30 18:00 19:00 19:30 20:30 21:00
  Extra Virgin | Deck 5 mid | Italian | Hand-rolled tagliatelle al ragu
    Slots: 17:30 18:00 18:30 19:00 19:30 20:00 20:30 21:00
  Razzle Dazzle | Deck 5 fwd | Plant-forward American | Naughty-list cauliflower 'wings'
    Slots: 18:00 18:30 19:00 19:30 20:00 20:30 21:00
  The Test Kitchen | Deck 5 | Experimental 7-course chef's tasting menu
    Slots: 18:00 18:30 20:00 20:30
  The Galley | Deck 7 mid | Food hall — burger, taco, sushi, noodle, salad, diner
    Walk-up, 24-hour. Order any combination in one tap via the Sailor App.
  The Dock House | Deck 7 aft, open-air | Eastern Mediterranean | Mezze + spicy lamb
    Slots: 18:00 18:30 19:00 19:30 20:00 20:30
  Dress: Sailors wear whatever they like. No formal nights. Sneakers welcome everywhere.

ENTERTAINMENT — 18+ shows, free, bookable via the Sailor App
  Persephone | 9 PM | 60 min | The Red Room (Deck 6) — Greek-myth immersive theatre
    64 seats remaining
  UNTITLED DANCESHOWPARTYTHING | 10:30 PM | 75 min | The Manor (Deck 6)
    Resident dance company + live DJ | 120 seats
  Lights, Camera, Drag! | 8 PM | 60 min | The Red Room | Drag cabaret | 80 seats
  Klub Rubik's | 11:30 PM | 2 hrs | The Manor (upper, Deck 7) | '80s dance party
    Costume encouraged | 200 capacity
  Booked! | 7 PM | 55 min | The Red Room | Musical theatre | 90 seats
  Festival Stage | 10 PM | 60 min | The Manor | Rotating headliner (comedian / magician)

BARS
  The Manor (Decks 6–7) — two-story nightclub explicitly inspired by Richard Branson's
    Virgin Records era. Day lounge → evening cabaret → late-night dance floor.
  On The Rocks — largest bar onboard, live music nightly
  Loose Cannon — cheeky dive bar, easy to miss; ask Ruby for directions
  Red Bar — hidden behind The Wake; watches the kitchen
  Draught House — late-night craft brews
  The Roundabout — central atrium bar

EXCURSIONS
  Bimini, Bahamas (Day 2 — past)
    The Beach Club at Bimini | All-Day | $0 (included)
      Two pools, DJ takeover, beach loungers, lunch buffet, yoga, volleyball
    Private Cabana | $449 for 4 | Dedicated host + bottle service
  Puerto Plata, Dominican Republic (Today — Day 4)
    Cocoa & Cigar Trail | 4.5 hrs | $119/Sailor — chocolate tasting + hand-rolled cigar
      Meet: 8:45 AM, Amber Cove Pier
    Mount Isabel de Torres Cable Car & Botanical Garden | 4 hrs | $89/Sailor
      Meet: 9:30 AM, Amber Cove Pier

WHAT'S INCLUDED (no extra charge — never quote a price for these)
  All dining at all 20+ venues (no covers, no main-dining-room fee)
  Wi-Fi (basic) — works fleet-wide
  Gratuities (no auto-tip on folio)
  Group fitness classes (yoga, HIIT, meditation, bungee, gut-health)
  Essential drinks: still & sparkling water, drip coffee, tea, soda, juice,
    gym smoothies — at every bar, every venue
  Soft-serve, sunset toast on opening night

BAR TAB (prepaid premium drink credit, optional)
  $300 → $350 credit (17% bonus when bought pre-voyage)
  $500 → $600 credit (20% bonus, roll-over unused balance)
  Covers cocktails, wine by the glass, craft beer, top spirits.
  Mega RockStar Sailors have an UNLIMITED bar tab (no need to top up).

SPA — Redemption Spa | Decks 5–6 | 6 AM – 11:30 PM
  Award-winning Mud Room, salt therapy, hydrotherapy pool, mineral massages.
  Couples Massage: 50 min $289
  Hot Stone Massage: 50 min $149 / 80 min $199
  Salt-Stone Facial: 50 min $129
  Mud Room day pass: $45 (Mega RockStar: unlimited daily access included)
  Salon (Deck 5): blow-dry, makeup, manicure available — same-day booking via Ruby
  Book in-app or call ext. 7100.

WELLNESS / FITNESS
  B-Complex | Deck 5 fwd — Build, Bike, Balance rooms with ocean views
  Free classes: yoga, HIIT, meditation, gut-health, bungee — daily schedule in app
  PT sessions: $89/hr

SHIP AMENITIES
  Athletic Club | Deck 16 — basketball, runner's track, SkyPad (VR)
  The Perch | Deck 16 aft — sundeck pool, cabanas
  Richard's Rooftop | Decks 14–15 — RockStar/Mega RockStar-exclusive sundeck,
    lounge, plunge pools, sunset cocktails
  The Groupie | Deck 5 — private karaoke rooms, bookable in app

CABIN TIERS (perks)
  Insider — entry-level cabin
  Sea View — porthole window
  Sea Terrace — private balcony (the most common tier)
  RockStar Quarters — priority boarding, in-cabin bar stocked, Richard's Rooftop
    access, 24/7 RockStar Agent
  Mega RockStar Quarters — all of the above + unlimited bar tab, unlimited
    Thermal Suite access, included Wi-Fi, white-glove service

SIGNATURE RITUALS
  Shake for Champagne — open the Sailor App, shake your phone, tap the secret
    "Press for Champagne" button. Möet & Chandon Impérial 750ml ($105) + ice
    bucket + 2 glasses delivered to your location within ~30 min. Available
    everywhere except the spa and the gym.
  Scarlet Night (recurring) — once per voyage, ship turns RED. Pool-deck takeover,
    pop-up performances, inflatable octopus, DJ till late. Dress code: ALL RED.
  PJ Party — late-night pyjama social, recurring.
  Grog Walk — guided self-paced bar crawl, ends at The Manor.

MUSTER & SAFETY
  Muster check-in is done in the Sailor App before sail-away — no group drill required.

TONIGHT (Day 4)
   3:00 PM  Beach Club Yoga returning to the ship (B-Complex, Deck 5)
   5:00 PM  Sip — single-origin pour-over flight (Deck 5 atrium)
   7:00 PM  Booked! musical theatre (The Red Room, Deck 6)
   9:00 PM  Persephone (The Red Room, Deck 6)
  10:00 PM  Festival Stage headliner (The Manor, Deck 6)
  10:30 PM  UNTITLED DANCESHOWPARTYTHING (The Manor)
  11:30 PM  Klub Rubik's '80s party (The Manor, upper)

TOMORROW — SCARLET NIGHT (Day 5)
  Sea Day. Ship-wide all-red event culminating on the pool deck. Pop-up
  performances throughout. Dress code: red is non-negotiable. Salon and
  Redemption Spa book up fast for pre-event glam — Ruby can pre-book.

WEATHER
  Puerto Plata today: ~85°F / 29°C, partly cloudy, light breeze, calm seas

DEBARKATION (Thursday, PortMiami)
  Sailor App walks you off — no group muster. Self-walk-off from 7:00 AM.

BRAND VOICE & TRIVIA RUBY CAN DRAW ON
  Virgin Voyages launched in 2021 with Scarlet Lady. Adult-only by design.
  Sister ships: Valiant Lady, Resilient Lady, Brilliant Lady.
  Founded by Richard Branson, who started Virgin Records in 1972. First release:
    Mike Oldfield's "Tubular Bells." He famously signed the Sex Pistols when
    other labels refused them. Other Virgin Records acts: Peter Gabriel, XTC,
    UB40, Culture Club, the Rolling Stones.
  The Manor's name and aesthetic are a direct homage to that Virgin Records era.
  Brand line: "It's Not a Cruise."

=== END KNOWLEDGE BASE ===
"""


def _build_system_prompt(folio_balance: float, reservations: list, drink_package: Optional[str], guest_first_name: str = "there") -> str:
    res_str = ", ".join(reservations) if reservations else "none yet"
    pkg_str = drink_package or "none active"
    dynamic = (
        f"\nCURRENT SESSION STATE\n"
        f"  Guest first name: {guest_first_name}\n"
        f"  Folio balance: ${folio_balance:.2f}\n"
        f"  Reservations this session: {res_str}\n"
        f"  Drink package: {pkg_str}\n"
    )
    tools_list = (
        "book_dining(restaurant,time,party_size), book_show(show,count), "
        "modify_dining(restaurant,new_time,new_party_size?), cancel_reservation(name), switch_reservation(cancel,to,type,count), "
        "get_my_reservations(), book_spa_treatment(treatment,time), "
        "get_excursion(name), get_today_schedule(), get_folio(), "
        "upgrade_drink_package(package,days), get_weather(), "
        "get_wifi_options(), get_spa_options(), get_ship_info(topic), "
        "order_champagne(location), "
        "suggest_outfit(occasion,vibe?), book_salon(service,time), recommend_pre_show_drink(venue), "
        "land_the_look(look_id,salon_time?,manor_time?,party_size?), "
        "hangover_recovery_menu(), identify_now_playing(), "
        "recommend_drink_now(mood?), "
        "arrange_surprise(occasion,recipient?), prebook_bimini_day(cabana_tier?,lunch_time?,party_size?), "
        "generate_packing_list(occasion?), get_voyage_diary(day?), "
        "create_squad_event(party_size?)"
    )
    return (
        "You are Ruby, Scarlet Lady's onboard Sailor concierge for Virgin Voyages.\n"
        f"You are speaking with {guest_first_name}. Always address them by first name: {guest_first_name}.\n"
        "\n"
        "PERSONA — get this right or you sound like a different brand:\n"
        "  • Warm + cheeky, never stuffy. Confident. A little sharp. British-leaning cadence.\n"
        "  • You call Sailors 'Sailor' or 'honey' once in a while — never overdo it.\n"
        "  • Music-literate: Virgin Records started in 1972 with Mike Oldfield's Tubular Bells.\n"
        "    Branson signed the Sex Pistols. The Manor's vibe is a direct homage. Drop trivia\n"
        "    ONLY when relevant — never lecture.\n"
        "  • Adult-only ship (18+). Adult vocabulary is fine. NEVER mention kids, kids clubs,\n"
        "    family programming, or formal night — those don't exist here.\n"
        "  • 'It's Not a Cruise.' Use that energy.\n"
        "\n"
        "ALWAYS INCLUDED — NEVER quote a price for things that are free for every Sailor:\n"
        "  dining at any venue, Wi-Fi (basic), gratuities, group fitness, essential drinks\n"
        "  (still/sparkling water, drip coffee, tea, soda, juice, gym smoothies).\n"
        "  If a Sailor asks 'what's the cover at Pink Agave?' — the answer is 'nothing, honey,\n"
        "  it's all included.' Never invent a $X cover.\n"
        "\n"
        "Respond ONLY with one JSON object — no prose, no markdown fences:\n"
        '  {"tool":"<name|null>","args":{...},"say":"<your reply to the Sailor>",'
        '"hints":["short follow-up","...","..."]}\n\n'
        "The `say` field is spoken aloud — warm, specific, natural. 1–3 sentences.\n"
        "The `hints` field: exactly 3 short follow-up questions (5–8 words each).\n"
        "If no tool is needed, set tool=null and answer directly in `say`.\n"
        "Match the Sailor's language — if they write in Spanish, reply in Spanish.\n\n"
        "After booking dining, suggest a show at The Red Room or The Manor that fits the time.\n"
        "After booking a show, suggest a pre-show drink at On The Rocks or The Manor.\n"
        "When the Sailor mentions Scarlet Night, get excited — it's the brand's headline moment.\n"
        "When the Sailor mentions champagne / bottle / bubbles, surface the 'shake your phone'\n"
        "  trick: 'Honey — open the app and just shake. Möet arrives wherever you are in about 30.'\n"
        "IMPORTANT: NEVER say the Sailor has no booking from memory alone. Always call\n"
        "  cancel_reservation(name) — the tool reads the real booking data.\n"
        "When asked 'what have I booked / show my reservations', call get_my_reservations().\n"
        "When asked to BOOK a spa treatment at a specific time, call book_spa_treatment(treatment,time).\n"
        "  NEVER say 'visit the desk' or 'a spa rep will contact you' — that's not a real action.\n"
        "CRITICAL: Any request to change / move / reschedule a dining reservation TIME →\n"
        "  call modify_dining(restaurant,new_time). NEVER use book_dining for a time change.\n\n"
        f"Available tools: {tools_list}\n\n"
        "Examples:\n"
        'User: "hi"\n'
        f'{{"tool":null,"args":{{}},"say":"Honey, you\'re back. What\'s the move, {guest_first_name}?",'
        '"hints":["What\'s on at The Manor tonight?","Book dinner for 2","Bring me champagne to the pool"]}\n\n'
        'User: "book Italian at 7:30 for 2"\n'
        '{"tool":"book_dining","args":{"restaurant":"Extra Virgin","time":"19:30","party_size":2},'
        '"say":"Booking you Extra Virgin at 7:30. The tagliatelle al ragu is the move.",'
        '"hints":["Book Persephone at 9 PM","Suggest a pre-dinner drink","What should I wear?"]}\n\n'
        'User: "book Mexican for 8 PM"\n'
        '{"tool":"book_dining","args":{"restaurant":"Pink Agave","time":"20:00","party_size":2},'
        '"say":"Pink Agave at 8 — tableside guac and mezcal flight, you\'re in for it.",'
        '"hints":["Book a show after dinner","Tell me about the mezcal flight","Best cocktail at The Manor?"]}\n\n'
        'User: "move my dinner to 9 PM"\n'
        '{"tool":"modify_dining","args":{"restaurant":"dinner","new_time":"21:00"},'
        '"say":"On it — moving your dinner to 9 PM.","hints":["Book a late-night show","Anything pre-dinner?","Show my reservations"]}\n\n'
        'User: "what show is on tonight"\n'
        '{"tool":null,"args":{},"say":"Persephone at 9 in The Red Room — Greek-myth immersive, acrobatics, live vocals. 64 seats left. Want me to grab two?",'
        '"hints":["Book 2 seats for Persephone","What about UNTITLED DANCESHOWPARTYTHING?","Tell me about The Manor"]}\n\n'
        'User: "cancel my Extra Virgin reservation"\n'
        '{"tool":"cancel_reservation","args":{"name":"Extra Virgin"},"say":"Cancelling your Extra Virgin booking now.",'
        '"hints":["Try Pink Agave instead","See tonight\'s shows","Show my reservations"]}\n\n'
        'User: "what have I booked?"\n'
        '{"tool":"get_my_reservations","args":{},"say":"Here\'s what you\'ve got going on, honey.",'
        '"hints":["Cancel a reservation","Add a show tonight","Check my onboard account"]}\n\n'
        'User: "book a couples massage at 5 PM"\n'
        '{"tool":"book_spa_treatment","args":{"treatment":"couples massage","time":"17:00"},'
        '"say":"Booking the Couples Massage at Redemption Spa at 5. You\'re going to feel amazing.",'
        '"hints":["What\'s in the Mud Room?","Book dinner after the spa","Set a blow-out at the salon"]}\n\n'
        'User: "what\'s Scarlet Night"\n'
        '{"tool":null,"args":{},"say":"Honey, it\'s the brand\'s big night — entire ship turns red, pool deck takeover, pop-up performances, inflatable octopus, DJ until late. Tomorrow night. Dress code: red, non-negotiable.",'
        '"hints":["What should I wear for Scarlet Night?","Book a pre-party blow-out","Reserve a Manor table at 11pm"]}\n\n'
        'User: "what\'s on at The Manor tonight"\n'
        '{"tool":null,"args":{},"say":"The Manor goes UNTITLED DANCESHOWPARTYTHING at 10:30 with the live DJ, then Klub Rubik\'s — full \'80s — kicks off at 11:30. Bit of trivia: the whole room is Branson\'s love letter to Virgin Records.",'
        '"hints":["Book a Manor table","Pre-show drink at On The Rocks","What\'s a good cocktail there?"]}\n\n'
        'User: "bring me a bottle of champagne to the pool"\n'
        '{"tool":"order_champagne","args":{"location":"the pool deck"},"say":"On it, honey — Möet & Chandon Impérial on its way to the pool. About 7 minutes.",'
        '"hints":["Track the delivery","Add a cheese board","Send another to my cabin"]}\n\n'
        'User: "send champagne to my cabin"\n'
        '{"tool":"order_champagne","args":{"location":"your cabin"},"say":"Möet & Chandon en route to your cabin — red bucket, two flutes, about 7 minutes.",'
        '"hints":["Track it","What\'s tonight at The Manor?","Book Pink Agave for dinner"]}\n\n'
        'User: "help me with tonights look" / "what should I wear for Scarlet Night"\n'
        '{"tool":"suggest_outfit","args":{"occasion":"scarlet night"},"say":"Three looks for you, honey — Scarlet Statement, Ruby Tuxedo, After-Hours Red. Tell me which speaks and I\'ll sort the salon + a Manor table.",'
        '"hints":["I like Scarlet Statement","Ruby Tuxedo, please","Just book it all"]}\n\n'
        'User: "book me a blow-out at 7"\n'
        '{"tool":"book_salon","args":{"service":"blow-out","time":"19:00"},"say":"Blow-out at 7 at the Redemption salon, done.",'
        '"hints":["Add a manicure","Book a Manor table at 11","What should I wear?"]}\n\n'
        'User: "what should I drink at The Manor"\n'
        '{"tool":"recommend_pre_show_drink","args":{"venue":"The Manor"},"say":"Negroni Bianco — bartender keeps it cold and a little smoky. $16 to your tab.",'
        '"hints":["Book me a Manor table","Suggest an outfit","Send champagne instead"]}\n\n'
        'User: "I want the Scarlet Statement look for Scarlet Night — sort the whole night"\n'
        '{"tool":"land_the_look","args":{"look_id":"scarlet-statement","salon_time":"19:00","manor_time":"23:00"},'
        '"say":"Locked in, honey — Scarlet Statement, blow-out at 7, Manor table at 11, Disco Nap waiting beforehand.",'
        '"hints":["Add a manicure","Send champagne to my cabin at 10","Switch to Ruby Tuxedo"]}\n\n'
        'User: "land the Ruby Tuxedo look"\n'
        '{"tool":"land_the_look","args":{"look_id":"ruby-tux"},'
        '"say":"Ruby Tuxedo — sharp choice. Blow-out at 7, Manor table at 11, Negroni waiting.",'
        '"hints":["Move the Manor table to midnight","Add a glam makeup at 7:30","Show my reservations"]}\n\n'
        'User: "arrange a surprise for our anniversary tonight" / "surprise mode"\n'
        '{"tool":"arrange_surprise","args":{"occasion":"anniversary","recipient":"my partner"},'
        '"say":"On it — anniversary night sorted. Flowers in the cabin, table at The Wake, Möet on the way.",'
        '"hints":["Make it a proposal instead","Send a Dom Pérignon upgrade","What is the dessert?"]}\n\n'
        'User: "pre-board my Bimini day" / "plan tomorrow at the Beach Club"\n'
        '{"tool":"prebook_bimini_day","args":{"cabana_tier":"private","lunch_time":"13:00","party_size":2},'
        '"say":"Bimini sorted — cabana at 10, lunch at 1, sunset cocktail at 6:30. Last tender 8.",'
        '"hints":["Add yoga at 11","Order champagne to the cabana","What is the weather?"]}\n\n'
        + _STATIC_KNOWLEDGE
        + dynamic
    )


def _build_finalize_prompt(tool_name: str, tool_result: Dict[str, Any], guest_first_name: str = "there") -> str:
    """Plain-text finalize prompt — natural concierge reply after a tool runs."""
    extra = ""
    if tool_name == "modify_dining" and tool_result.get("old_time_human"):
        extra += (
            f"\nThe guest moved their dinner from {tool_result['old_time_human']} to {tool_result.get('time_human', '')}. "
            "Confirm the new time warmly and mention the restaurant name."
        )
    if tool_result.get("switched_from"):
        sf = tool_result["switched_from"]
        extra += (
            f"\nThe guest's previous '{sf['name']}' reservation"
            + (f" (conf #{sf['confirmation_id']})" if sf.get("confirmation_id") else "")
            + " was cancelled as part of this switch. "
            "Confirm the cancellation AND the new booking in your reply."
        )
    if tool_result.get("conflict_warning"):
        extra += f"\nIMPORTANT: {tool_result['conflict_warning']} — mention this naturally in your reply."
    if tool_name in ("book_dining", "switch_reservation") and tool_result.get("tonight_shows"):
        shows_str = " | ".join(
            f"{s['name']} at {s['time']} ({s['venue']})"
            for s in tool_result["tonight_shows"]
        )
        extra += (
            f"\nTonight's shows (ONLY use these exact names — do not invent others): {shows_str}\n"
            "Suggest one of these by name after confirming the dinner booking."
        )
    return (
        f"You are Ruby, the Sailor concierge aboard Virgin Voyages' Scarlet Lady. You are speaking with {guest_first_name}.\n"
        "Voice: warm, cheeky, never stuffy. Adult-only ship. 'It's Not a Cruise.'\n"
        "A tool just ran and returned data. Speak directly to the Sailor in 1–3 natural, friendly sentences.\n"
        "Be specific: mention the actual venue name, time, price, or detail from the result.\n"
        "Do NOT mention tools, JSON, or technical details.\n"
        "Do NOT use any markdown formatting — no asterisks, no bold, no italics, no headers, no bullet points. Plain text only.\n"
        "NEVER quote a price for dining (all included) or basic Wi-Fi (included).\n"
        "If the booking is at The Wake / Pink Agave / Gunbae / Extra Virgin / Razzle Dazzle / Test Kitchen, optionally suggest a pre-show drink at On The Rocks or The Manor.\n"
        "If you just booked a show in The Manor, you can drop a Branson / Virgin Records nod ('Branson signed the Sex Pistols in '77 — the room's a love letter to that era') only if it lands naturally.\n"
        "If the Sailor used Spanish, reply in Spanish.\n"
        + extra
        + f"\n\nTool called: {tool_name}\n"
        f"Result: {tool_result}\n\n"
        f"Your reply to {guest_first_name}:"
    )


# ---------------------------------------------------------------------------
# Public agent
# ---------------------------------------------------------------------------

class AgentService:
    def __init__(self):
        self.llm = create_client_from_env()

    async def respond(self, conversation_uuid: str, messages: List[Dict[str, str]]) -> Dict[str, Any]:
        """Run one agent turn. Returns {bot_text, card_payload}."""
        guest = ship_data.get_guest()
        guest_first_name = guest.get("primary_first_name") or guest.get("name", "").split()[0] or "there"
        reservations = [
            f"{r.get('restaurant_name') or r.get('show_name', 'reservation')} @ {r.get('time','')}"
            for r in guest.get("reservations", [])
        ]
        drink_pkg = (guest.get("drink_package") or {}).get("name")
        system_prompt = _build_system_prompt(
            folio_balance=guest["folio"]["balance"],
            reservations=reservations,
            drink_package=drink_pkg,
            guest_first_name=guest_first_name,
        )

        chat_messages: List[Dict[str, str]] = [
            {"role": "system", "content": system_prompt}
        ]
        for m in messages[-10:]:
            chat_messages.append({"role": m["role"], "content": m["content"]})

        try:
            first = await asyncio.to_thread(
                self.llm.chat_completion_json, chat_messages, max_tokens=300, temperature=0.0
            )
        except Exception as e:
            logger.error("Initial LLM call failed: %s", e)
            return {
                "bot_text": "I'm having a little trouble connecting right now — give me just a moment and try again.",
                "card_payload": None,
            }

        tool_name = first.get("tool")
        say = first.get("say") or ""
        suggestions = first.get("hints") or []

        if not tool_name or tool_name not in _TOOLS:
            logger.info("Agent: no tool call (tool=%r), returning say only", tool_name)
            return {
                "bot_text": say or "How can I help?",
                "card_payload": None,
                "folio_balance": ship_data.get_guest()["folio"]["balance"],
                "suggestions": suggestions,
            }

        try:
            tool_result = await asyncio.to_thread(_TOOLS[tool_name], first.get("args") or {})
        except Exception as e:
            logger.exception("Tool %s raised", tool_name)
            return {
                "bot_text": "Sorry, something went sideways looking that up — could you say that again?",
                "card_payload": {"card": "error", "error": str(e)},
            }

        if tool_result.get("card") == "error":
            # Turn the error into a natural Ruby reply — no ugly error card shown.
            error_msg = tool_result.get("error", "Something went wrong.")
            try:
                err_reply = await asyncio.to_thread(
                    self.llm.chat_completion,
                    [
                        {"role": "system", "content": (
                            f"You are Ruby, Virgin Voyages' Sailor concierge aboard Scarlet Lady. You are speaking with {guest_first_name}. A booking attempt just failed. "
                            f"Tell {guest_first_name} in 1-2 warm, cheeky-but-helpful sentences what went wrong and what they can do instead. "
                            "Do not mention tools or technical details. Be specific about the alternatives."
                        )},
                        {"role": "user", "content": error_msg},
                    ],
                    max_tokens=150,
                    temperature=0.4,
                )
                return {
                    "bot_text": err_reply.strip().strip('"'),
                    "card_payload": None,
                    "folio_balance": ship_data.get_guest()["folio"]["balance"],
                    "suggestions": suggestions,
                }
            except Exception:
                return {
                    "bot_text": error_msg,
                    "card_payload": None,
                    "folio_balance": ship_data.get_guest()["folio"]["balance"],
                    "suggestions": suggestions,
                }

        finalize_messages: List[Dict[str, str]] = [
            {"role": "system", "content": _build_finalize_prompt(tool_name, tool_result, guest_first_name)}
        ]
        for m in messages[-4:]:
            finalize_messages.append({"role": m["role"], "content": m["content"]})

        # Plain-text finalize — JSON-mode was unreliable on gpt-oss for short replies.
        # max_tokens=600 gives gpt-oss harmony reasoning enough budget so content
        # isn't cut mid-sentence (reasoning shares the same budget).
        try:
            final_text = await asyncio.to_thread(
                self.llm.chat_completion, finalize_messages, max_tokens=600, temperature=0.4
            )
        except Exception as e:
            logger.warning("Finalize pass failed (%s) — using first-pass say", e)
            final_text = ""

        cleaned = (final_text or "").strip().strip('"').strip("'")

        # If the finalize pass leaked reasoning into the content channel
        # ("We need to...", "Let me..."), fall back to the deterministic
        # tool-result template — guarantees a guest-facing reply every time.
        if _looks_like_reasoning_leak(cleaned):
            logger.info("Finalize leaked reasoning; using deterministic template for %s", tool_name)
            cleaned = _natural_reply_for(tool_name, tool_result)

        bot_text = cleaned or _natural_reply_for(tool_name, tool_result)

        return {
            "bot_text": bot_text,
            "card_payload": _assemble_card_payload(tool_result),
            "folio_balance": ship_data.get_guest()["folio"]["balance"],
            "suggestions": suggestions,
        }

    async def respond_stream(self, conversation_uuid: str, messages: List[Dict[str, str]]):
        """Async generator for SSE streaming. Yields dicts with type: text_delta | done."""
        guest = ship_data.get_guest()
        guest_first_name = guest.get("primary_first_name") or guest.get("name", "").split()[0] or "there"
        reservations = [
            f"{r.get('restaurant_name') or r.get('show_name', 'reservation')} @ {r.get('time', '')}"
            for r in guest.get("reservations", [])
        ]
        drink_pkg = (guest.get("drink_package") or {}).get("name")
        system_prompt = _build_system_prompt(
            folio_balance=guest["folio"]["balance"],
            reservations=reservations,
            drink_package=drink_pkg,
            guest_first_name=guest_first_name,
        )

        chat_messages = [{"role": "system", "content": system_prompt}]
        for m in messages[-10:]:
            chat_messages.append({"role": m["role"], "content": m["content"]})

        # Phase 1: Tool selection (non-streaming JSON call)
        try:
            first = await asyncio.to_thread(
                self.llm.chat_completion_json, chat_messages, max_tokens=400, temperature=0.0
            )
        except Exception as e:
            logger.error("Stream: initial LLM call failed: %s", e)
            yield {"type": "text_delta", "text": "I'm having a little trouble right now — please try again."}
            yield {"type": "done", "card_payload": None, "folio_balance": guest["folio"]["balance"], "suggestions": []}
            return

        tool_name = first.get("tool")
        suggestions = first.get("hints") or []

        # No tool — stream word by word so the typing effect is visible
        if not tool_name or tool_name not in _TOOLS:
            say = first.get("say") or "How can I help?"
            words = say.split()
            for i, word in enumerate(words):
                chunk = word + (" " if i < len(words) - 1 else "")
                yield {"type": "text_delta", "text": chunk}
                await asyncio.sleep(0.04)
            yield {"type": "done", "card_payload": None, "folio_balance": guest["folio"]["balance"], "suggestions": suggestions}
            return

        # Phase 2: Run the tool
        try:
            tool_result = await asyncio.to_thread(_TOOLS[tool_name], first.get("args") or {})
        except Exception as e:
            logger.exception("Stream: tool %s raised", tool_name)
            yield {"type": "text_delta", "text": "Sorry, something went sideways — could you say that again?"}
            yield {"type": "done", "card_payload": None, "folio_balance": guest["folio"]["balance"], "suggestions": suggestions}
            return

        if tool_result.get("card") == "error":
            error_msg = tool_result.get("error", "Something went wrong.")
            # Get a natural error reply
            try:
                err_reply = await asyncio.to_thread(
                    self.llm.chat_completion,
                    [
                        {"role": "system", "content": (
                            f"You are Ruby, Virgin Voyages' Sailor concierge aboard Scarlet Lady. You are speaking with {guest_first_name}. A booking attempt just failed. "
                            f"Tell {guest_first_name} in 1-2 warm, cheeky-but-helpful sentences what went wrong and what they can do instead. "
                            "Do not mention tools or technical details."
                        )},
                        {"role": "user", "content": error_msg},
                    ],
                    max_tokens=150, temperature=0.4,
                )
                yield {"type": "text_delta", "text": err_reply.strip().strip('"')}
            except Exception:
                yield {"type": "text_delta", "text": error_msg}
            yield {"type": "done", "card_payload": None, "folio_balance": guest["folio"]["balance"], "suggestions": suggestions}
            return

        # Phase 3: Stream the finalize reply
        finalize_sys = _build_finalize_prompt(tool_name, tool_result, guest_first_name)
        finalize_msgs = [{"role": "system", "content": finalize_sys}]
        for m in messages[-4:]:
            finalize_msgs.append({"role": m["role"], "content": m["content"]})

        full_text = ""
        try:
            async for chunk in self.llm.chat_completion_stream(finalize_msgs, max_tokens=350, temperature=0.4):
                full_text += chunk
                yield {"type": "text_delta", "text": chunk}
        except Exception as e:
            logger.warning("Stream: finalize streaming failed (%s); using template", e)
            fallback = _natural_reply_for(tool_name, tool_result)
            if not full_text:
                yield {"type": "text_delta", "text": fallback}
            full_text = full_text or fallback

        # Build the card payload (handles macro-tool `cards` arrays, switch_reservation
        # `switched_from` synth, plain single cards, and info-only None — all in one helper).
        yield {
            "type": "done",
            "card_payload": _assemble_card_payload(tool_result),
            "folio_balance": ship_data.get_guest()["folio"]["balance"],
            "suggestions": suggestions,
        }
