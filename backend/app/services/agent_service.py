"""Onboard concierge agent — Marenova Cruise Line, Marenova Aurora demo.

Concierge persona: Marina. Warm, upbeat, family-friendly; loves a stargazing or
music fun fact, knows the ship's venues cold, "Always Included" framing.

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
            {"time": "15:00", "title": "Beach Club Yoga (returning guests)", "venue": "Wellness Deck, Deck 5"},
            {"time": "19:00", "title": "Center Stage — musical theatre", "venue": "Aurora Theater, Deck 6"},
            {"time": "22:00", "title": "Main Stage — tonight's headliner", "venue": "Starlight Lounge, Deck 6"},
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

    # Bar Tabs are a one-time prepaid purchase: a fixed dollar amount that buys
    # a larger credit value (e.g. $500 → $600). The per-day field is 0.00 since
    # the credit doesn't expire daily. Always-Included is $0.
    days = int(days_arg) if days_arg else ship_data.remaining_cruise_days()
    one_time = float(pkg.get("one_time_price", 0))
    credit = float(pkg.get("credit_value", 0))
    charged = round(one_time, 2)

    ship_data.set_drink_package(pkg["id"], days, charged)
    line_item = None
    if charged > 0:
        line_item = ship_data.add_folio_charge(
            f"{pkg['name']} — prepaid Refreshment Package",
            charged,
        )
    new_balance = ship_data.get_guest()["folio"]["balance"]
    return {
        "card": "drink_package",
        "package": pkg,
        "days": days,
        "charged_to_folio": charged,
        "credit_loaded": credit,
        "new_folio_balance": new_balance,
        # Backward-compat keys still read by the old natural-reply path
        "total": charged,
        "new_balance": new_balance,
        "line_item": line_item,
    }


def _tool_recommend_drink_packages(_args: Dict[str, Any]) -> Dict[str, Any]:
    """Show the two real Bar Tab tiers as side-by-side picker cards.

    Used when the guest says generic "upgrade my drink package" with no
    specific tier. Prevents Marina from inventing tiers (e.g. "premium_unlimited")
    that don't exist in drink_packages.json.
    """
    pkgs = [
        ship_data.find_drink_package("bar-tab-300"),
        ship_data.find_drink_package("bar-tab-500"),
    ]
    pkgs = [p for p in pkgs if p]  # safety
    cards = []
    for p in pkgs:
        cards.append({
            "card": "drink_package_option",
            "package": p,
            "one_time_price": p.get("one_time_price", 0),
            "credit_value": p.get("credit_value", 0),
            "suggested_action": f"Give me the ${int(p.get('one_time_price', 0))} package",
        })
    return {
        "cards": cards,
        "options_shown": [p["id"] for p in pkgs],
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
    ship_data.add_folio_charge(f"Serenity Spa — {treatment['name']}", discounted)

    return {
        "card": "spa_booking",
        "treatment": treatment["name"],
        "duration_min": treatment["duration_min"],
        "original_price": original,
        "discounted_price": discounted,
        "savings": savings,
        "time": time,
        "time_human": _human_time(time),
        "location": "Serenity Spa, Decks 5–6",
        "confirmation_id": confirmation_id,
        "vifp_note": f"Always Included guest perk — gratuity is on us. (Saved ${savings:.2f})",
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

    today_label = cruise.get("today_label", "Puerto Plata, Dominican Republic")
    next_port = (cruise.get("next_port") or {}).get("name", "")
    result = {
        "card": "weather",
        "location": today_label,
        # Wave 5 — port labels carried explicitly so the WeatherCard can drop
        # the hardcoded "Cozumel Tomorrow" Carnival-era label.
        "port_today_name": today_label,
        "next_port_name": next_port,
        "port_date": f"Today, Day {cruise.get('current_day', 4)} of {cruise.get('total_days', 6)}",
        # 'port_today' is the live-fetched current-port forecast.
        # 'cozumel' key kept as alias for backward-compat with older frontend.
        "port_today": port_weather,
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
            {"name": "Aurora Grand Suite", "price_per_day": 0, "includes": "Premium Wi-Fi included with your suite — no purchase needed"},
        ],
        "purchase": "Upgrade in the Marenova Aurora App or at any bar — guest Services will sort you out.",
    }


def _tool_get_spa_options(_args: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "topic": "spa",
        "location": "Serenity Spa, Decks 5–6",
        "hours": "6 AM – 11:30 PM",
        "services": [
            {"name": "Hot Stone Massage", "duration_min": 50, "price": 149},
            {"name": "Hot Stone Massage", "duration_min": 80, "price": 199},
            {"name": "Couples Massage", "duration_min": 50, "price": 289},
            {"name": "Salt-Stone Facial", "duration_min": 50, "price": 129},
            {"name": "Mud Room Day Pass", "price": 45, "note": "complimentary with any treatment; unlimited for Aurora Grand Suite guests"},
        ],
        "vifp_discount": "Always Included — no auto-gratuity, no add-on fees.",
        "booking": "Tap Book in the Marenova Aurora App or call ext. 7100",
    }


def _tool_get_ship_info(args: Dict[str, Any]) -> Dict[str, Any]:
    topic = (args.get("topic") or "general").lower()
    info_map = {
        "pool": "The Aurora Deck (Deck 16 aft) — sundeck pool with cabanas. Aquatic Club (Deck 7 pool deck) for the main pool action, plus the kids' splash zone and waterslides.",
        "casino": "The Casino, Deck 6 — open from 8 PM at sea, closed in port. 18+ to play; intimate scale, not a megacasino.",
        "kids": "Absolutely — Aurora Kids Club (ages 3–12) and the Teen Lounge (13–17) run daily, plus character meet-and-greets, mini-golf, a ropes course, and waterslides. Family programming all week.",
        "gym": "Wellness Deck, Deck 5 forward. Three rooms: Build (weights), Bike (spin), Balance (yoga). 6 AM – 11:30 PM. All group classes included.",
        "medical": "Medical Centre, Deck 2 mid-ship. Open 24/7 for emergencies; scheduled hours 8–11 AM and 4–7 PM. Dial ext. 911 for emergencies.",
        "muster": "Muster check-in is done entirely in the Marenova Aurora App — no group drill required. Tap 'Muster' before sail-away.",
        "shopping": "Sundries Shop (Deck 5) and the curated High Street boutiques (Deck 7) — open at sea after 6 PM.",
        "dining": "All 20+ venues are included — no covers anywhere. Reservations recommended for specialty (Horizon Steakhouse, Agave Coast, Seoul Table, Bella Mare, Garden & Vine, Chef's Table, Mezze Bay). The Marketplace food hall is 24-hour walk-up.",
        "photo": "Aurora Snaps, Deck 5. Digital download bundle: $99. Print-on-demand kiosks throughout the ship.",
        "room service": "ShipEats room service: 24/7. Free menu plus à la carte upgrades. Order in the Marenova Aurora App or tap the cabin tablet.",
        "manor": "Starlight Lounge, Decks 6–7 — a two-story live-entertainment venue: daytime lounge, evening shows, and a late-night all-ages dance floor under the stars.",
        "treat": "Shake your phone in the Marenova Aurora App — a secret button appears — and a treat (gelato sundae, fresh smoothie, mocktail, or popcorn bucket) is delivered wherever you are in about 30 minutes.",
        "starlight deck party": "Once per voyage the top deck lights up for the Starlight Deck Party — a family dance party under the stars with glow accessories, a live DJ, and a dazzling light show. Dress bright and fun. Tomorrow night this sailing.",
        "wifi": "Basic Wi-Fi included for every guest. Upgrade to Premium ($20/day) for streaming, Zoom, video calls.",
        "suite": "Aurora Suite = The Aurora Deck access, in-cabin treats, 24/7 Aurora Concierge, and kids-club priority. Aurora Grand Suite adds an unlimited Refreshment Package, unlimited Thermal Suite access, and included Premium Wi-Fi.",
    }
    for key, val in info_map.items():
        if key in topic:
            return {"topic": topic, "info": val}
    return {"topic": topic, "info": "Guest Services on Deck 5 (or message us in the app) can help with anything I haven't covered."}


# ─── Tonight's Look: outfit + salon + pre-show drink (multi-tool chain) ──────

_OUTFIT_LOOKBOOK = {
    "starlight deck party": [
        {
            "id": "scarlet-statement",
            "name": "Starlight Sparkle",
            "description": "Shimmer midi dress + light wrap. Comfy block heel. Hair: sleek low bun.",
            "image": "/looks/scarlet-statement.svg",
            "vibe": "Catch the light on the deck-party dance floor.",
            "needs": ["blow-out", "smoky-eye"],
        },
        {
            "id": "crimson-tux",
            "name": "Deck Party Sharp",
            "description": "Tailored blazer + crisp tee + clean sneakers. Optional bow tie for photos.",
            "image": "/looks/crimson-tux.svg",
            "vibe": "Sharp and easy. Made for the Starlight light show.",
            "needs": ["trim", "manicure"],
        },
        {
            "id": "after-hours",
            "name": "Evening Glow",
            "description": "Flowing column dress with a subtle slit. Drop earrings, gold cuff.",
            "image": "/looks/after-hours.svg",
            "vibe": "Quiet drama for the late shows and stargazing.",
            "needs": ["updo", "polish"],
        },
    ],
    "starlight lounge": [
        {
            "id": "manor-disco",
            "name": "Lounge Ready",
            "description": "Metallic top + dark jeans + ankle boots. Light jacket for the deck walk.",
            "image": "/looks/manor-disco.svg",
            "vibe": "Built to dance.",
            "needs": ["blow-out"],
        },
    ],
    "pool day": [
        {
            "id": "pool-rouge",
            "name": "Pool-Deck Bright",
            "description": "Bold one-piece + linen overshirt + woven mules. Straw bag.",
            "image": "/looks/pool-rouge.svg",
            "vibe": "Smoothie on the Aurora Deck.",
            "needs": [],
        },
    ],
    "aurora cay": [
        {
            "id": "bimini-easy",
            "name": "Aurora Cay Easy",
            "description": "Cream linen set + raffia tote + slim-strap sandal.",
            "image": "/looks/bimini-easy.svg",
            "vibe": "Beach-to-cabana smooth.",
            "needs": [],
        },
    ],
}


def _tool_suggest_outfit(args: Dict[str, Any]) -> Dict[str, Any]:
    """Suggest 1–3 looks for tonight's occasion (Starlight Deck Party, Starlight Lounge, pool, Aurora Cay)."""
    occasion = (args.get("occasion") or "starlight deck party").strip().lower()
    vibe = (args.get("vibe") or "").strip().lower()

    # Fuzzy match
    key = "starlight deck party"
    for k in _OUTFIT_LOOKBOOK:
        if k in occasion or occasion in k:
            key = k
            break

    looks = _OUTFIT_LOOKBOOK.get(key, _OUTFIT_LOOKBOOK["starlight deck party"])
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
            "a Starlight Lounge table to land your night."
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
    """Book a salon service at Serenity Spa (Deck 5 salon side).

    Optional `look_id` is folded into the confirmation hash so that booking a
    blow-out for two different looks (Scarlet Statement vs Crimson Tuxedo) yields
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
    ship_data.add_folio_charge(f"Serenity Spa Salon — {service['name']}", service["price"])

    return {
        "card": "salon_booking",
        "service": service["name"],
        "duration_min": service["duration_min"],
        "price": service["price"],
        "time": time,
        "time_human": _human_time(time),
        "location": "Serenity Spa Salon, Deck 5",
        "confirmation_id": confirmation_id,
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
    }


# ─── Tonight's Look — macro tool to land the whole look ────────────────────
# Maps each look's id to (refreshment name, venue, deck, price, vibe-line).
# Genuinely different per look so the 3 outfit choices feel distinct.
_LOOK_COCKTAIL = {
    "scarlet-statement": {
        "drink": "Aurora Sparkler (sparkling berry mocktail)",
        "venue": "Sunset Bar", "deck": 6, "price": 9,
        "vibe": "Shimmer + bubbles. You're ready to own the deck party.",
    },
    "crimson-tux": {
        "drink": "Cold Brew Tonic",
        "venue": "Sunset Bar", "deck": 6, "price": 8,
        "vibe": "Sharp look, sharp sip — exactly the Starlight Lounge mood.",
    },
    "after-hours": {
        "drink": "Berry Fizz (zero-proof)",
        "venue": "The Hideaway", "deck": 6, "price": 9,
        "vibe": "Flowing dress + slow-sipped berries. For the late shows and stargazing.",
    },
}

# Display data for outfit_confirmed card (matches frontend lookbook).
_LOOK_DETAILS = {
    "scarlet-statement": {
        "name": "Starlight Sparkle", "image": "/looks/scarlet-statement.svg",
        "summary": "Shimmer midi dress + light wrap. Comfy block heel. Hair: sleek low bun.",
    },
    "crimson-tux": {
        "name": "Deck Party Sharp", "image": "/looks/crimson-tux.svg",
        "summary": "Tailored blazer + crisp tee + clean sneakers. Optional bow tie for photos.",
    },
    "after-hours": {
        "name": "Evening Glow", "image": "/looks/after-hours.svg",
        "summary": "Flowing column dress with a subtle slit. Drop earrings, gold cuff.",
    },
}


# ─── Morning Reset — one cohesive wellness "menu" card ─────────────────────
# A single well-designed card beats 4 noisy ones. Books two real reservations
# under the hood (hydration boost + late breakfast) so the menu items echo
# into My Reservations + folio.
_RECOVERY_ITEMS = [
    {"id": "hydration-drip", "icon": "💧", "title": "Hydration & vitamin boost — Serenity Spa", "detail": "30 min vitamin-infused hydration session · Deck 5", "price": 95, "time": "10:30", "book_as": "spa", "keywords": ["hydration", "boost", "vitamin", "reset"]},
    {"id": "smoothie", "icon": "🥬", "title": "Green smoothie — Wellness Deck", "detail": "Ginger, spinach, mango · grab-and-go · Deck 5", "price": 12, "time": "11:00", "book_as": None, "keywords": ["smoothie", "wellness", "green", "juice"]},
    {"id": "late-breakfast", "icon": "🍳", "title": "Late breakfast at Horizon Steakhouse", "detail": "Eggs Benedict + fresh juice bar", "price": 0, "time": "11:30", "book_as": "dining", "keywords": ["breakfast", "wake", "eggs", "benedict", "juice"]},
    {"id": "cabana-siesta", "icon": "😎", "title": "Cabana siesta on the Aurora Deck", "detail": "Reserved lounger · Deck 16 aft", "price": 25, "time": "13:30", "book_as": "lounger", "keywords": ["cabana", "siesta", "lounger", "deck", "nap"]},
]


def _book_recovery_items(items: list, conf: str) -> None:
    """Persist reservations + folio charges for a subset of recovery items.

    Uses add_reservation_dedup so calling hangover_recovery_menu twice (or
    pairing it with a specific-item booking) doesn't create duplicate rows.
    """
    for it in items:
        book_as = it.get("book_as")
        price = it.get("price", 0)
        if book_as == "spa":
            ship_data.add_reservation_dedup("spa", {
                "treatment_name": it["title"],
                "time": it["time"], "time_human": _human_time(it["time"]),
                "duration_min": 30, "price": price,
                "confirmation_id": f"SPA{abs(hash((it['id'], conf))) % 100000:05d}",
            })
        elif book_as == "dining":
            ship_data.add_reservation_dedup("dining", {
                # distinct restaurant_id from the real "the-wake" dinner slot
                "restaurant_id": "the-wake-breakfast",
                "restaurant_name": "Horizon Steakhouse (late breakfast)",
                "time": it["time"], "time_human": _human_time(it["time"]),
                "party_size": 1,
                "confirmation_id": f"BR{abs(hash((it['id'], conf))) % 100000:05d}",
            })
        elif book_as == "lounger":
            ship_data.add_reservation_dedup("lounger", {
                "treatment_name": it["title"],
                "time": it["time"], "time_human": _human_time(it["time"]),
                "price": price,
                "confirmation_id": f"LNG{abs(hash((it['id'], conf))) % 100000:05d}",
            })
        # Folio charges only for items with a price > 0
        if price > 0:
            ship_data.add_folio_charge(it["title"], price)


def _resolve_recovery_items(requested: list) -> list:
    """Map a list of user-supplied item names/ids/keywords to recovery item dicts.

    Order-preserving, deduplicated. Returns empty list if nothing matches —
    the calling tool decides whether to fall back to the full menu.
    """
    if not requested:
        return []
    seen_ids = set()
    matched = []
    for raw in requested:
        q = str(raw).strip().lower()
        if not q:
            continue
        for item in _RECOVERY_ITEMS:
            if item["id"] in seen_ids:
                continue
            if (
                q == item["id"]
                or q in item["title"].lower()
                or any(kw in q or q in kw for kw in item["keywords"])
            ):
                matched.append(item)
                seen_ids.add(item["id"])
                break
    return matched


def _tool_hangover_recovery_menu(_args: Dict[str, Any]) -> Dict[str, Any]:
    """Preview-only recovery menu — shows the 4 options without booking anything.

    Wave 5: this tool no longer creates reservations or folio charges. The
    guest's mental model for "open / show me the recovery menu" is preview,
    not commit. Booking happens exclusively through book_recovery_item:
    name specific items, or pass all four ids to book the whole preset.
    """
    total = sum(item["price"] for item in _RECOVERY_ITEMS)
    conf = f"REC{abs(hash(('recovery-preview', _time.time()))) % 100000:05d}"
    return {
        "card": "recovery_menu",
        "title": "Morning Reset",
        "subtitle": "Tap an item or tell me which to book.",
        "items": _RECOVERY_ITEMS,
        "confirmation_id": conf,
        "total": total,
        "preview": True,
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
    }


def _tool_book_recovery_item(args: Dict[str, Any]) -> Dict[str, Any]:
    """Book a subset of the recovery menu (1+ named items).

    args:
        items: list of names/ids/keywords (e.g. ["hydration drip", "b-complex smoothie"])
               or comma-separated string for LLM convenience.
    """
    raw = args.get("items") or args.get("item") or []
    if isinstance(raw, str):
        # Tolerate "hydration drip, smoothie" as one string from the LLM.
        raw = [s.strip() for s in raw.split(",") if s.strip()]
    matched = _resolve_recovery_items(raw)
    if not matched:
        # Fall back to the full menu rather than fail — same shape, full preset.
        return _tool_hangover_recovery_menu({})

    total = sum(item["price"] for item in matched)
    conf = f"REC{abs(hash(('recovery-item', _time.time()))) % 100000:05d}"
    _book_recovery_items(matched, conf)
    return {
        "card": "recovery_menu",
        "title": "Sorted, honey",
        "subtitle": "Just the items you asked for.",
        "items": matched,
        "confirmation_id": conf,
        "total": total,
        "subset": True,
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
    }


# ─── Starlight Shazam — identify what's playing right now ──────────────────
# Track DB tagged with `set_name` — same keys as the dashboard widget's
# MANOR_SETS in [frontend/src/components/music/NowPlayingManor.jsx] so the
# Shazam result aligns with whatever set the dashboard says is currently live.
# (Bug B4 fix.)
#
# Set keys: sundowner-disco · dinner-funk · marvy-house · klub-rubiks-80s ·
#           afterhours-grooves · winddown-soul · preview
_MANOR_TRACKLIST = [
    # 70s disco era — sundowner + dinner sets
    {"track": "Le Freak", "artist": "Chic", "year": 1978, "vibe": "Disco",
     "set_name": "sundowner-disco",
     "trivia": "Nile Rodgers wrote it after being turned away from Studio 54."},
    {"track": "Dance Away", "artist": "Roxy Music", "year": 1979, "vibe": "Art-rock disco",
     "set_name": "sundowner-disco",
     "trivia": "Bryan Ferry at his smoothest. Golden-hour energy in song form."},
    {"track": "Sledgehammer", "artist": "Peter Gabriel", "year": 1986, "vibe": "Soulful funk-rock",
     "set_name": "dinner-funk",
     "trivia": "That iconic stop-motion video changed MTV forever."},
    {"track": "Red Red Wine", "artist": "UB40", "year": 1983, "vibe": "Reggae-funk",
     "set_name": "dinner-funk",
     "trivia": "A Neil Diamond cover that became a reggae anthem nobody saw coming."},
    # House/disco set — DJ Marvy Main Stage
    {"track": "Tubular Bells — Pt. I", "artist": "Mike Oldfield", "year": 1973, "vibe": "Prog / chill-out edit",
     "set_name": "marvy-house",
     "trivia": "The instrumental that launched a thousand stargazing playlists."},
    # 80s dance — Retro Deck Party
    {"track": "Karma Chameleon", "artist": "Culture Club", "year": 1983, "vibe": "Synth-pop",
     "set_name": "klub-rubiks-80s",
     "trivia": "Boy George and Culture Club at their absolute peak."},
    {"track": "Don't You Want Me", "artist": "The Human League", "year": 1981, "vibe": "Synth-pop",
     "set_name": "klub-rubiks-80s",
     "trivia": "The synth-pop Christmas #1 that defined an era."},
    # After-hours / wind-down — late grooves
    {"track": "Good Times", "artist": "Chic", "year": 1979, "vibe": "Disco-funk",
     "set_name": "afterhours-grooves",
     "trivia": "The bassline the whole of early hip-hop was built on."},
    {"track": "I Got You (I Feel Good)", "artist": "James Brown", "year": 1965, "vibe": "Wind-down soul",
     "set_name": "winddown-soul",
     "trivia": "The Godfather of Soul at his most joyful."},
]


# Explicit hour → set lookup — robust across the after-midnight rollover that
# broke the naive "latest entry where s.h <= now" iteration (the h=3 wind-down
# entry was winning for ANY current hour ≥ 3).
# Must stay in sync with MANOR_SETS in [frontend/src/components/music/NowPlayingManor.jsx].
_MANOR_HOUR_LOOKUP = {
    16: "marvy-house",  17: "marvy-house",   # preview window — show tonight's headliner
    18: "sundowner-disco", 19: "sundowner-disco",
    20: "dinner-funk",     21: "dinner-funk",
    22: "marvy-house",
    23: "klub-rubiks-80s", 0: "klub-rubiks-80s",
    1: "afterhours-grooves", 2: "afterhours-grooves",
    3: "winddown-soul", 4: "winddown-soul",
    # 5-15 → daytime, fall back to the marvy-house preview
}

_MANOR_SET_META = {
    "sundowner-disco":    {"dj": "DJ House Mother",         "label": "Sundowner Disco",      "vibe": "70s disco · golden-hour grooves",   "until": "8 PM"},
    "dinner-funk":        {"dj": "DJ House Mother",         "label": "Dinner Funk Hour",     "vibe": "Soulful funk for the dinner crowd",  "until": "10 PM"},
    "marvy-house":        {"dj": "DJ Marvy",                "label": "DJ Marvy",             "vibe": "House & disco festival set",         "until": "11:30 PM"},
    "klub-rubiks-80s":    {"dj": "Resident · Retro Deck Party", "label": "Retro Deck Party",         "vibe": "'80s dance party (costume encouraged)", "until": "1:30 AM"},
    "afterhours-grooves": {"dj": "DJ Marvy",                "label": "After-Hours Grooves",  "vibe": "Late-night house grooves",      "until": "late"},
    "winddown-soul":      {"dj": "Resident",                "label": "Wind-Down Soul",       "vibe": "Slow soul to ease into the morning", "until": "5 AM"},
}


def _current_manor_set() -> Dict[str, Any]:
    """Return the set currently 'playing' in Starlight Lounge based on local hour.
    Matches the dashboard widget's currentSet() logic 1:1 so they stay synced."""
    import datetime as _dt
    h = _dt.datetime.now().hour
    set_name = _MANOR_HOUR_LOOKUP.get(h, "marvy-house")
    preview = (5 <= h < 16)
    meta = _MANOR_SET_META[set_name]
    return {
        "h": h,
        "set_name": set_name,
        "set_label": meta["label"],
        "set_vibe": meta["vibe"],
        "dj": meta["dj"],
        "until": meta["until"],
        "preview": preview,
    }


def _tool_identify_now_playing(_args: Dict[str, Any]) -> Dict[str, Any]:
    """Starlight Shazam — identify the track currently playing.

    Now syncs with the dashboard widget: looks up the currently-live DJ set,
    then picks a track tagged with that set's `set_name`. So when the widget
    shows 'DJ Marvy · house & disco', the Shazam result is from that set.
    """
    import datetime as _dt
    current_set = _current_manor_set()
    set_tracks = [t for t in _MANOR_TRACKLIST if t["set_name"] == current_set["set_name"]]
    # Fall back to the whole list if no tracks tagged for this set
    pool = set_tracks if set_tracks else _MANOR_TRACKLIST
    idx = (_dt.datetime.now().minute // 6) % len(pool)
    pick = pool[idx]
    return {
        "card": "now_playing_track",
        "track": pick["track"],
        "artist": pick["artist"],
        "year": pick["year"],
        "vibe": pick["vibe"],
        "venue": "Starlight Lounge",
        "deck": 6,
        "dj": current_set["dj"],
        "set_name": current_set["set_name"],
        "set_label": current_set["set_label"],
        "set_vibe": current_set["set_vibe"],
        "set_until": current_set["until"],
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
        "drink": "Cold Brew Tonic", "venue": "Bean & Berry", "deck": 6, "price": 8,
        "caption": "Late afternoon dip + a long night ahead — cold brew with a citrus lift.",
    },
    "celebratory": {
        "drink": "Aurora Sparkler (sparkling berry mocktail)", "venue": "Sunset Bar", "deck": 6, "price": 9,
        "caption": "A toast worthy of the moment — bright, bubbly, zero-proof.",
    },
    "winding down": {
        "drink": "Chamomile & Honey Cooler", "venue": "Sunset Bar", "deck": 6, "price": 8,
        "caption": "Warm-spiced and easy. For the kind of evening that doesn't need volume.",
    },
    "fired up": {
        "drink": "Tropical Smoothie", "venue": "Agave Coast juice bar", "deck": 5, "price": 9,
        "caption": "Mango, passionfruit, a little kick of ginger. Pre-show fuel.",
    },
    "fancy": {
        "drink": "Garden Fizz (citrus + sparkling)", "venue": "Bean & Berry", "deck": 7, "price": 9,
        "caption": "Citrus + sparkling. Always the right answer when you're feeling fancy.",
    },
}


def _tool_recommend_drink_now(args: Dict[str, Any]) -> Dict[str, Any]:
    """Mood-based 'right-now' refreshment picker. Distinct from
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


# ─── Surprise Mode — celebration macro (all-ages) ──────────────────────────
_SURPRISE_PRESETS = {
    "anniversary": {
        "headline": "Anniversary night, sorted.",
        "flowers": {"item": "Long-stem red roses (24)", "price": 110, "location": "your cabin"},
        "restaurant_id": "the-wake",
        "restaurant_name": "Horizon Steakhouse",
        "dinner_time": "20:00",
        "champagne": "Sparkling apple cider toast (poured table-side)",
        "dessert": "Chocolate Soufflé with your partner's name in chocolate script",
        "extras": "Live cellist for first 15 min · table near the ocean windows",
    },
    "birthday": {
        "headline": "Birthday locked in.",
        "flowers": {"item": "Mixed peony bouquet", "price": 95, "location": "your cabin"},
        "restaurant_id": "pink-agave",
        "restaurant_name": "Agave Coast",
        "dinner_time": "20:30",
        "champagne": "Birthday cake + sparkling grape juice toast",
        "dessert": "Tres Leches with a sparkler + name in agave syrup",
        "extras": "Mariachi cameo at 9:15 · churros for the table",
    },
    "proposal": {
        "headline": "Question of the year, sorted.",
        "flowers": {"item": "Single white rose + petals path", "price": 140, "location": "your cabin"},
        "restaurant_id": "the-wake",
        "restaurant_name": "Horizon Steakhouse",
        "dinner_time": "19:30",
        "champagne": "Sparkling cider + a dessert tower for two",
        "dessert": "Stargazer raspberry tart, served on its own",
        "extras": "Reserved private alcove · photographer on standby · ring kept by the Aurora Concierge",
    },
}


def _tool_arrange_surprise(args: Dict[str, Any]) -> Dict[str, Any]:
    """Coordinate a 4-touchpoint celebration (flowers + dining + celebration
    toast + dessert). Returns one headline `surprise_summary` card plus the
    actual dining + treat cards so real reservations + folio updates happen.
    """
    occasion = (args.get("occasion") or "anniversary").strip().lower()
    if "birthday" in occasion: occasion = "birthday"
    elif "propos" in occasion or "engage" in occasion or "ring" in occasion: occasion = "proposal"
    else: occasion = "anniversary"

    recipient = (args.get("recipient") or args.get("partner") or "your partner").strip()
    preset = _SURPRISE_PRESETS[occasion]

    # 1) Flowers — reservation only (no separate card; surfaces in summary)
    flowers_conf = f"FLW{abs(hash(('flowers', occasion, _time.time()))) % 100000:05d}"
    flowers_existing = ship_data.add_reservation_dedup("flowers", {
        "treatment_name": preset["flowers"]["item"],
        "time": "17:00", "time_human": _human_time("17:00"),
        "price": preset["flowers"]["price"],
        "confirmation_id": flowers_conf,
    })
    # Only charge folio if this was a fresh booking (dedup returned existing → skip)
    if flowers_existing.get("confirmation_id") == flowers_conf:
        ship_data.add_folio_charge(f"Surprise — {preset['flowers']['item']}", preset["flowers"]["price"])

    # 2) Dining — real booking via book_dining
    dining_card = _tool_book_dining({
        "restaurant": preset["restaurant_name"],
        "time": preset["dinner_time"],
        "party_size": 2,
    })

    # 3) Celebration toast — real booking via order_champagne (delivered table-side)
    # Pre-positioned at the dinner time — NOT the "~7 min ETA" framing (B2 fix).
    # Pass the preset's toast name + price so the card matches the summary.
    bottle_name = preset.get("champagne", "").split(" (")[0] or "Sparkling cider toast"
    champagne_price = 45.00
    champagne_card = _tool_order_champagne({
        "location": f"your table at {preset['restaurant_name']}",
        "bottle": bottle_name,
        "price": champagne_price,
        "scheduled_time": preset["dinner_time"],
    })

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
    ship_data.add_reservation_dedup("surprise", {
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


# ─── Pre-Boarder for Aurora Cay — port-day automation macro ────────────────────
def _tool_prebook_bimini_day(args: Dict[str, Any]) -> Dict[str, Any]:
    """Pre-stage a full day at the Aurora Cay Beach Day: cabana + lunch slot +
    sunset ice-cream social + departure reminder. Returns a port_day_plan summary
    card plus the real cabana excursion + lunch dining + refreshment cards.
    """
    cabana_tier = (args.get("cabana_tier") or "private").strip().lower()
    lunch_time = (args.get("lunch_time") or "13:00").strip()
    party_size = int(args.get("party_size") or 2)

    # Cabana — use the existing Aurora Cay cabana excursion (matches data file)
    excursion = ship_data.find_excursion("bimini-cabana") or ship_data.find_excursion("bimini-beach-club")
    excursion_card = None
    if excursion:
        conf = f"EXC{abs(hash(('bimini-cabana', _time.time()))) % 100000:05d}"
        existing = ship_data.add_reservation_dedup("excursion", {
            "excursion_id": excursion["id"],
            "excursion_name": excursion["name"],
            "treatment_name": excursion["name"],
            "time": excursion.get("meet_time", "10:00"),
            "time_human": _human_time(excursion.get("meet_time", "10:00")),
            "party_size": party_size,
            "price": excursion.get("price_per_guest", 0),
            "confirmation_id": conf,
        })
        if existing.get("confirmation_id") == conf and excursion.get("price_per_guest", 0) > 0:
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
    ship_data.add_reservation_dedup("dining", {
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
            "location": "Aurora Cay Beach Day, beachside pavilion",
            "headline_dish": "Conch fritters, jerk chicken, fresh ceviche",
            "cover_charge": 0,
        },
        "time": lunch_time, "time_human": _human_time(lunch_time),
        "date": _cruise_date(1),  # tomorrow if Aurora Cay is next port
        "party_size": party_size,
        "confirmation_id": lunch_conf,
    }

    # Sunset ice-cream social — drink_pairing card pre-staged for ~18:30
    cocktail_card = {
        "card": "drink_pairing",
        "drink": "Aurora Cay Sunset Cooler (passionfruit + mint, zero-proof) + gelato cart",
        "venue": "Beach Club Beach Bar",
        "deck": 0,
        "price": 9,
        "note": "Waiting for you at 6:30 PM. Last call before the tender back.",
    }

    # Port-day plan summary (lead card)
    plan_card = {
        "card": "port_day_plan",
        "port": "Aurora Cay, Bahamas",
        "weather": {"temp_f": 84, "condition": "Sunny", "uv": 9, "sea_state": "Glass calm"},
        "cabana_tier": cabana_tier,
        "party_size": party_size,
        "agenda": [
            {"time": "09:30", "what": "Tender from ship to Beach Club"},
            {"time": "10:00", "what": "Cabana check-in + cold towels"},
            {"time": (lunch_time), "what": "Beach Club lunch buffet"},
            {"time": "14:30", "what": "Pool volleyball / family DJ session"},
            {"time": "18:30", "what": "Sunset ice-cream social + mocktails at the Beach Bar"},
            {"time": "20:00", "what": "Last tender back — don't miss it"},
        ],
        "confirmation_id": f"ACY{abs(hash(('aurora-cay-day', _time.time()))) % 100000:05d}",
    }

    # Port-day-plan reservation marker
    ship_data.add_reservation_dedup("port_day_plan", {
        "treatment_name": "Aurora Cay Beach Day — full day plan",
        "time": "09:30", "time_human": "9:30 AM",
        "confirmation_id": plan_card["confirmation_id"],
    })

    cards = [plan_card]
    if excursion_card: cards.append(excursion_card)
    cards.append(lunch_card)
    cards.append(cocktail_card)

    return {
        "port": "Aurora Cay, Bahamas",
        "party_size": party_size,
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
        "cards": cards,
    }


# ─── Pack Forecaster — AI-tailored packing list for the voyage ─────────────
def _tool_generate_packing_list(args: Dict[str, Any]) -> Dict[str, Any]:
    """Tailored packing list — all-ages, no formal night, bright/glow for the
    Starlight Deck Party, swimwear for Aurora Cay, family essentials."""
    occasion = (args.get("occasion") or "voyage").strip().lower()
    cruise = ship_data.get_cruise()
    sections = [
        {
            "title": "✨ Starlight Deck Party",
            "subtitle": "Tomorrow night. Dress bright and fun.",
            "items": [
                {"name": "Bright or glow-in-the-dark outfit", "tag": "recommended"},
                {"name": "Glow accessories / light-up wristbands (we hand some out too!)", "tag": "optional"},
                {"name": "Comfortable dance shoes — top-deck party", "tag": "essential"},
                {"name": "Sequins / metallics that catch the light show", "tag": "optional"},
            ],
        },
        {
            "title": "🏝 Aurora Cay Beach Day",
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
            "title": "🎶 Starlight Lounge & shows",
            "subtitle": "Two-story live-entertainment venue. Built to dance.",
            "items": [
                {"name": "1-2 going-out outfits (room to move)", "tag": "essential"},
                {"name": "Comfortable heels OR sneakers — your call", "tag": "essential"},
                {"name": "Small crossbody bag", "tag": "recommended"},
                {"name": "Light layer for the deck walk back", "tag": "optional"},
            ],
        },
        {
            "title": "👨‍👩‍👧 Family essentials",
            "subtitle": "For traveling with kids (skip if it's just the grown-ups).",
            "items": [
                {"name": "Kids' swimwear + rash guards", "tag": "essential"},
                {"name": "Comfort items / favorite toys for the little ones", "tag": "recommended"},
                {"name": "Refillable water bottles for the whole crew", "tag": "recommended"},
                {"name": "Any medications + a small first-aid kit", "tag": "essential"},
            ],
        },
        {
            "title": "💆 Spa & wellness",
            "subtitle": "Serenity Spa + Wellness Deck gym.",
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
                {"name": "Phone (Marenova Aurora App = your room key, muster, payments)", "tag": "essential"},
                {"name": "Portable charger", "tag": "recommended"},
                {"name": "Passport / ID — soft copy in phone + paper backup", "tag": "essential"},
                {"name": "Travel insurance card", "tag": "optional"},
            ],
        },
    ]
    return {
        "card": "packing_list",
        "title": "Your Marenova Aurora packing list",
        "subtitle": f"Tailored for the {cruise.get('itinerary_name', 'voyage')} — no formal nights, family-friendly, dress bright for the Starlight Deck Party.",
        "ship": cruise.get("ship", "Marenova Aurora"),
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
        moments.append({"icon": "🎧", "label": "Tracks ID'd at Starlight Lounge", "value": str(plays)})
    if not moments:
        moments.append({"icon": "✨", "label": "A quiet chapter — sometimes the best kind.", "value": ""})

    # Header SVG per day (rotates through 5 day SVGs)
    header_svg = f"/diary/day-{((day - 1) % 5) + 1}.svg"

    return {
        "card": "voyage_diary",
        "day_label": f"Day {day} of {cruise.get('total_days', 6)} · {day_label}",
        "title": f"Today's chapter — {guest.get('primary_first_name', 'guest')}",
        "ship": cruise.get("ship", "Marenova Aurora"),
        "moments": moments,
        "stats": {
            "venues": len(set(r.get("restaurant_name") for r in reservations if r.get("restaurant_name"))),
            "photos": photos,
            "music_plays": plays,
            "folio_today": round(sum(it.get("amount", 0) for it in folio_today), 2),
        },
        "header_image": header_svg,
        "shareable_footer": "Tap to share your Marenova Aurora chapter →",
    }


# ─── Starlight Deck Party Squad Mode — cosmetic group coordination ────────────────
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
    ship_data.add_reservation_dedup("squad_event", {
        "treatment_name": f"Starlight Deck Party squad for {party_size}",
        "time": "23:00", "time_human": _human_time("23:00"),
        "confirmation_id": conf,
    })

    return {
        "card": "squad_event",
        "occasion": "Starlight Deck Party",
        "party_size": party_size,
        "invitees": invitees,
        # B3 fix: these mock names should render as SUGGESTIONS, not as
        # confirmed real invitees. Frontend mutes them + shows a "tap to swap"
        # subtitle. Marina's natural-reply for this tool reframes accordingly.
        "is_demo_data": True,
        "invitee_label": "Suggested invitees (tap to swap)",
        "invitee_hint": "These are guests you've cruised with before — tap any name to invite or swap.",
        "salon_window": "7:00 PM – 8:00 PM at Serenity Spa",
        "manor_table_time": "11:00 PM",
        "manor_table_label": f"Group table for {party_size}",
        "rendezvous": "Meet on the Sunset Deck (Deck 6) at 10:30 to head up together",
        "confirmation_id": conf,
        "share_link": f"https://app.marenovacruises.com/group/{conf}",
    }


def _tool_land_the_look(args: Dict[str, Any]) -> Dict[str, Any]:
    """Macro: confirm the chosen look + book salon + reserve a Starlight Lounge
    table + pair a refreshment — returned as 4 cards in one turn. Look-specific
    pairing and salon confirmation IDs so each look feels distinct.
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
        if "sparkle" in s or "starlight" in s or "statement" in s: return "scarlet-statement"
        if "sharp" in s or "tux" in s or "blazer" in s: return "crimson-tux"
        if "glow" in s or "evening" in s or "after" in s or "column" in s: return "after-hours"
        return None

    look_id = _resolve(raw)
    if look_id is None:
        return {"card": "error", "error": f"I don't know the '{raw}' look. Try Starlight Sparkle, Deck Party Sharp, or Evening Glow."}

    salon_time = (args.get("salon_time") or "19:00").strip()
    manor_time = (args.get("manor_time") or "23:00").strip()
    party_size = int(args.get("party_size") or 2)

    look = _LOOK_DETAILS[look_id]
    pairing = _LOOK_COCKTAIL[look_id]

    # 1) outfit_confirmed — record the choice as a reservation so it shows in My Reservations
    outfit_conf = f"OUT{abs(hash((look_id, salon_time))) % 100000:05d}"
    ship_data.add_reservation_dedup("outfit", {
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
        "occasion": "Starlight Deck Party",
        "confirmation_id": outfit_conf,
    }

    # 2) salon_booking — blow-out (sensible default for every look)
    salon_card = _tool_book_salon({
        "service": "blow-out",
        "time": salon_time,
        "look_id": look_id,  # makes confirmation unique per look
    })

    # 3) starlight_lounge table — new reservation kind
    manor_conf = f"SLT{abs(hash((look_id, manor_time, party_size))) % 100000:05d}"
    ship_data.add_reservation_dedup("manor_table", {
        "treatment_name": f"Starlight Lounge table for {party_size}",
        "venue": "Starlight Lounge",
        "deck": 6,
        "time": manor_time,
        "time_human": _human_time(manor_time),
        "party_size": party_size,
        "confirmation_id": manor_conf,
    })
    manor_card = {
        "card": "manor_table",
        "venue": "Starlight Lounge",
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
        "note": f"Pre-show sip — {pairing['vibe']}",
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
    "starlight lounge": {"name": "Aurora Sparkler (sparkling berry mocktail)", "venue": "Starlight Lounge", "deck": 6, "price": 9},
    "lounge":           {"name": "Aurora Sparkler (sparkling berry mocktail)", "venue": "Starlight Lounge", "deck": 6, "price": 9},
    "sunset bar":       {"name": "Cold Brew Tonic",        "venue": "Sunset Bar",       "deck": 6, "price": 8},
    "aurora theater":   {"name": "Garden Fizz (citrus + sparkling)", "venue": "Bean & Berry", "deck": 7, "price": 9},
    "the hideaway":     {"name": "Berry Fizz (zero-proof)", "venue": "The Hideaway",     "deck": 6, "price": 9},
    "agave coast":      {"name": "Tropical Smoothie",      "venue": "Agave Coast juice bar", "deck": 5, "price": 9},
    "horizon steakhouse":{"name": "Sparkling Cider",       "venue": "Bean & Berry",     "deck": 7, "price": 8},
}


def _tool_recommend_pre_show_drink(args: Dict[str, Any]) -> Dict[str, Any]:
    """Recommend a single refreshment + venue to pair with tonight's plan."""
    venue_query = (args.get("venue") or "starlight lounge").strip().lower()
    pick = None
    for k, v in _DRINK_PAIRING.items():
        if k in venue_query or venue_query in k:
            pick = v
            break
    pick = pick or _DRINK_PAIRING["starlight lounge"]

    return {
        "card": "drink_pairing",
        "drink": pick["name"],
        "venue": pick["venue"],
        "deck": pick["deck"],
        "price": pick["price"],
        "note": "Optional — sip first, then the show.",
    }


def _tool_order_champagne(args: Dict[str, Any]) -> Dict[str, Any]:
    """Shake-for-a-Treat — a treat delivered to a location.

    Defaults to a Gelato Sundae (complimentary, Marenova's signature ritual),
    but accepts overrides so a chained call from a `recommend_drink_now` /
    `recommend_pre_show_drink` follow-up ("send a smoothie to my cabin") can
    deliver a different treat. Also accepts a `scheduled_time` so the celebration
    macro can pre-position a toast at an upcoming dinner instead of using the
    immediate ~7-min ETA framing.

    NOTE: returns the `champagne` card type (kept stable so the frontend treat
    card + Shake-for-a-Treat module render it without dispatch changes).

    Args:
        location: where to deliver (defaults to the guest's cabin).
        bottle: override the treat name (e.g. "Mango Smoothie", "Popcorn Bucket").
        price: override the folio charge (defaults to 0 — treats are complimentary).
        dispatched_from: override the source (defaults to "Scoops, Deck 6").
        scheduled_time: HH:MM — when set, returns `scheduled_for` and suppresses ETA.
    """
    guest = ship_data.get_guest()
    location = (args.get("location") or "").strip()
    if not location:
        location = f"Cabin {guest.get('cabin', '')} · Deck {guest.get('deck', '')}".strip(" ·")
    location = location or "your current location"

    bottle = (args.get("bottle") or "Gelato Sundae").strip()
    bottle_price = float(args.get("price", 0.00))
    dispatched_from = (args.get("dispatched_from") or "Scoops, Deck 6").strip()
    scheduled_time = (args.get("scheduled_time") or "").strip()

    confirmation_id = f"CH{abs(hash((location, bottle, _time.time()))) % 100000:05d}"

    if bottle_price > 0:
        ship_data.add_folio_charge(
            f"{bottle} — delivered to {location}",
            bottle_price,
        )

    base = {
        "card": "champagne",
        "bottle": bottle,
        "price": bottle_price,
        "location": location,
        "dispatched_from": dispatched_from,
        "deck_path": [6, 5, 4, guest.get("deck", 8)],  # rough route for the tracker
        "confirmation_id": confirmation_id,
        "includes": ["your choice of treat", "delivered with a smile"],
        "new_folio_balance": ship_data.get_guest()["folio"]["balance"],
    }
    if scheduled_time:
        # Pre-positioned for a future event (used by arrange_surprise).
        base["scheduled_for"] = _human_time(scheduled_time)
        base["scheduled_time"] = scheduled_time
    else:
        # Live "shake for a treat" path — ETA framing.
        base["eta_minutes"] = 7
    return base


def _tool_modify_dining(args: Dict[str, Any]) -> Dict[str, Any]:
    restaurant_query = (args.get("restaurant") or args.get("name") or "").strip()
    new_time = (args.get("new_time") or args.get("time") or "").strip()
    new_party_size = int(args.get("new_party_size") or args.get("party_size") or 0) or None

    if not restaurant_query:
        return {"card": "error", "error": "I need the restaurant name to make the change."}

    # B7 fix: allow party-size-only modifications. If no new_time was supplied
    # but new_party_size is, preserve the existing reservation's time.
    if not new_time:
        if not new_party_size:
            return {"card": "error", "error": "Tell me the new time or the new party size."}
        # Look up the current reservation's time and reuse it (party-size-only update).
        dining = [r for r in ship_data.list_reservations() if r.get("kind") == "dining"]
        if not dining:
            return {"card": "error", "error": "You don't have any dining reservations to modify."}
        # Match same logic as ship_data.modify_reservation: 1 dining → that one;
        # else fuzzy match.
        target = dining[0] if len(dining) == 1 else next(
            (r for r in dining if restaurant_query.lower() in (r.get("restaurant_name") or "").lower()),
            dining[0],
        )
        new_time = target.get("time", "19:00")

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
        charged = tool_result.get("charged_to_folio", tool_result.get("total", 0))
        credit = tool_result.get("credit_loaded", 0)
        if charged > 0:
            return (
                f"{p.get('name', 'Refreshment Package')} loaded — ${charged:.0f} on your onboard account, "
                f"${credit:.0f} of credit to spend across the voyage."
            )
        return f"{p.get('name', 'Always Included')} — every guest gets this, no charge."
    if tool_name == "recommend_drink_packages":
        return (
            "Here are the two Refreshment Packages, honey — Classic ($150 gets you $175 of credit) "
            "and Premium ($250 gets you $300). Tap whichever fits your voyage."
        )
    if tool_name == "book_recovery_item":
        items = tool_result.get("items", []) or []
        if not items:
            return "Sorted, honey — recovery items are queued up."
        names = ", ".join(it.get("title", "item").split(" — ")[0] for it in items)
        return f"Sorted — {names}. Charges added to your folio if applicable."
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
            f"You're booked, honey — {t} at {time_h} at Serenity Spa. "
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
        return f"It's {day} — Center Stage at 7, Odyssey at 9, Starlight Lounge going late. {port} tomorrow."
    if tool_name == "order_champagne":
        loc = tool_result.get("location", "your location")
        eta = tool_result.get("eta_minutes", 7)
        treat = tool_result.get("bottle", "Your treat")
        return f"{treat} on the way to {loc}. About {eta} minutes — track it in the app, honey!"
    if tool_name == "suggest_outfit":
        looks = tool_result.get("looks", [])
        if not looks:
            return "Pulled a few looks for you — pick one and I'll sort the rest."
        names = ", ".join(l["name"] for l in looks)
        return f"Three looks: {names}. Tell me which speaks to you — I'll book the salon and a Starlight Lounge table to land it."
    if tool_name == "book_salon":
        s = tool_result.get("service", "service")
        t = tool_result.get("time_human", "")
        return f"{s} at {t} at the Serenity Spa salon — done. Confirmation #{tool_result.get('confirmation_id', '')}."
    if tool_name == "recommend_pre_show_drink":
        d = tool_result.get("drink", "a refreshment")
        v = tool_result.get("venue", "the bar")
        return f"{d} at {v} — that's the move. Want me to set a table?"
    if tool_name == "land_the_look":
        ln = tool_result.get("look_name", "your look")
        st = tool_result.get("salon_time_human", "")
        mt = tool_result.get("manor_time_human", "")
        ck = tool_result.get("cocktail", "a refreshment")
        return (
            f"Locked in for the Starlight Deck Party: {ln}, blow-out at {st}, Starlight Lounge table at {mt}, "
            f"and a {ck} waiting before you head in. You're sorted, honey."
        )
    if tool_name == "hangover_recovery_menu":
        return (
            "Need a reset? Here's the Morning Reset menu — hydration & vitamin boost, green smoothie, "
            "late breakfast at Horizon Steakhouse, cabana siesta on the Aurora Deck. Tell me which to book, "
            "or say 'book everything' and I'll lock all four in."
        )
    if tool_name == "identify_now_playing":
        t = tool_result.get("track", "that track")
        a = tool_result.get("artist", "")
        label = tool_result.get("set_label", "")
        vibe = tool_result.get("set_vibe", "")
        if label:
            set_phrase = f" — that's tonight's {label} set ({vibe})" if vibe else f" — from tonight's {label} set"
        else:
            set_phrase = ""
        return f"That's '{t}' by {a}{set_phrase}. Added to your Cruise Soundtrack on Spotify."
    if tool_name == "recommend_drink_now":
        d = tool_result.get("drink", "a refreshment")
        v = tool_result.get("venue", "the bar")
        return f"{d} at {v} — that's the answer, honey."
    if tool_name == "arrange_surprise":
        occ = tool_result.get("occasion", "surprise")
        who = tool_result.get("recipient", "your partner")
        return f"Sorted, honey — {occ} for {who} is on. Flowers waiting in the cabin, table booked, a celebration toast on the way."
    if tool_name == "prebook_bimini_day":
        return (
            "Tomorrow at Aurora Cay: cabana check-in at 10, lunch at 1, sunset ice-cream social at 6:30, "
            "last tender at 8. Sun's out, UV is high — pack the SPF."
        )
    if tool_name == "generate_packing_list":
        sec_count = len(tool_result.get("sections", []))
        return f"Packing list pulled — {sec_count} sections, bright-and-fun flagged for the Starlight Deck Party. No formal wear needed — family-friendly all the way."
    if tool_name == "get_voyage_diary":
        dl = tool_result.get("day_label", "today")
        return f"Here's {dl} — your moments, your photos, your tracks at Starlight Lounge. Shareable when you're ready."
    if tool_name == "create_squad_event":
        ps = tool_result.get("party_size", 4)
        n_invitees = len(tool_result.get("invitees", []) or [])
        # B3 fix: explicitly call out that the names are suggested — don't
        # narrate them as if they were the user's real friends.
        return (
            f"Group of {ps} drafted for the Starlight Deck Party — I've pulled {n_invitees} guests you've "
            f"cruised with before as suggested invitees (tap to swap or invite your own). "
            f"Coordinated salon window 7–8 PM, Starlight Lounge table at 11."
        )
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
    "book_recovery_item": _tool_book_recovery_item,
    "recommend_drink_packages": _tool_recommend_drink_packages,
}


_STATIC_KNOWLEDGE = """
=== MARENOVA CRUISE LINE — MARENOVA AURORA — CONCIERGE KNOWLEDGE BASE ===

VOYAGE
  Ship: Marenova Aurora | 5-Night Western Caribbean Getaway | All ages — families welcome
  Departure: PortMiami, FL — Saturday | Return: Thursday
  Today: Day 4 of 6 — Puerto Plata, Dominican Republic (port day)
  Tomorrow (Day 5): Sea Day — STARLIGHT DECK PARTY (top-deck family light show & dance party)
  Itinerary: PortMiami → Aurora Cay Beach Day → Sea Day → Puerto Plata → Sea Day (Starlight Deck Party) → PortMiami

GUEST
  (see dynamic session state below — guest name, cabin tier, folio, bookings)

DINING — 8 specialty restaurants, ALL INCLUDED (no cover charges)
  Plus The Marketplace food hall and casual options. Every venue is curated. Reservations recommended.
  Horizon Steakhouse | Deck 7 aft | Steak & Seafood | Signature: dry-aged ribeye with bordelaise
    Slots: 17:30 18:00 18:30 19:30 20:00 20:30 21:00
  Agave Coast | Deck 5 mid | Modern Mexican | Tableside guacamole + warm churros
    Slots: 17:30 18:00 18:30 19:00 19:30 20:00 21:00 21:30
  Seoul Table | Deck 6 mid | Korean BBQ | Wagyu short rib + interactive grill games
    Slots: 17:30 18:00 19:00 19:30 20:30 21:00
  Bella Mare | Deck 5 mid | Italian | Hand-rolled tagliatelle al ragu
    Slots: 17:30 18:00 18:30 19:00 19:30 20:00 20:30 21:00
  Garden & Vine | Deck 5 fwd | Plant-forward American | Crispy buffalo cauliflower 'wings'
    Slots: 18:00 18:30 19:00 19:30 20:00 20:30 21:00
  The Chef's Table | Deck 5 | Experimental 7-course chef's tasting menu
    Slots: 18:00 18:30 20:00 20:30
  The Marketplace | Deck 7 mid | Food hall — burger, taco, sushi, noodle, salad, diner
    Walk-up, 24-hour. Order any combination in one tap via the Marenova Aurora App. Kids' menus everywhere.
  Mezze Bay | Deck 7 aft, open-air | Eastern Mediterranean | Mezze + spicy lamb
    Slots: 18:00 18:30 19:00 19:30 20:00 20:30
  Dress: guests wear whatever they like. No formal nights. Sneakers welcome everywhere.

ENTERTAINMENT — all-ages shows, free, bookable via the Marenova Aurora App
  Odyssey | 9 PM | 60 min | Aurora Theater (Deck 6) — Greek-myth immersive theatre
    64 seats remaining
  Aurora Live | 10:30 PM | 75 min | Starlight Lounge (Deck 6)
    Resident dance company + live DJ | 120 seats
  Showstoppers | 8 PM | 60 min | Aurora Theater | Broadway hits revue | 80 seats
  Retro Deck Party | 11:30 PM | 2 hrs | Starlight Lounge (upper, Deck 7) | '80s & '90s dance party
    Costume encouraged | 200 capacity
  Center Stage | 7 PM | 55 min | Aurora Theater | Musical theatre | 90 seats
  Main Stage | 10 PM | 60 min | Starlight Lounge | Rotating headliner (comedian / magician / family act)

VENUES & BARS
  Starlight Lounge (Decks 6–7) — two-story live-entertainment venue: a daytime lounge,
    evening shows, and a late-night all-ages dance floor under a ceiling of stars.
  Sunset Bar — largest lounge onboard, live music nightly, full mocktail menu
  Bean & Berry — specialty coffee, fresh juice & smoothie bar (Deck 7)
  Scoops — gelato & soft-serve counter (Deck 6) — the home of Shake for a Treat
  The Hideaway — cozy café tucked away; ask Marina for directions
  The Roundabout — central atrium bar & juice spot

EXCURSIONS
  Aurora Cay, Bahamas (Day 2 — past)
    Aurora Cay Beach Day | All-Day | $0 (included)
      Two pools, kids' splash zone & waterslide, beach loungers, lunch buffet, snorkeling, volleyball
    Private Family Cabana | $449 for 6 | Dedicated host + snacks & soft drinks
  Puerto Plata, Dominican Republic (Today — Day 4)
    Chocolate Farm Tour | 4.5 hrs | $119/guest — cocoa-farm tour + chocolate tasting + truffle-making
      Meet: 8:45 AM, Amber Cove Pier
    Mount Isabel de Torres Cable Car & Botanical Garden | 4 hrs | $89/guest
      Meet: 9:30 AM, Amber Cove Pier

WHAT'S INCLUDED (no extra charge — never quote a price for these)
  All dining at all 20+ venues (no covers, no main-dining-room fee)
  Wi-Fi (basic) — works fleet-wide
  Gratuities (no auto-tip on folio)
  Group fitness classes (yoga, HIIT, meditation, family stretch)
  Essential drinks: still & sparkling water, drip coffee, tea, soda, juice,
    gym smoothies, soft-serve — at every venue
  Aurora Kids Club, Teen Lounge, mini-golf, ropes course, waterslides, character meet-and-greets

REFRESHMENT PACKAGES (prepaid drink credit, optional — all non-alcoholic)
  Exactly two paid tiers — there are NO other tiers, no "unlimited" upgrade:
    bar-tab-300 (Refreshment Package Classic): $150 → $175 credit (17% bonus when bought pre-voyage)
    bar-tab-500 (Refreshment Package Premium): $250 → $300 credit (20% bonus, roll-over unused balance)
  Covers specialty coffees, fresh juices, smoothies, sodas, gelato shakes, and house mocktails.
  Aurora Grand Suite guests have an UNLIMITED Refreshment Package as part of the cabin tier
  (this is a cabin perk, NOT an upgrade Marina can sell — never propose it as a tier).

SPA — Serenity Spa | Decks 5–6 | 6 AM – 11:30 PM
  Award-winning Mud Room, salt therapy, hydrotherapy pool, mineral massages.
  Couples Massage: 50 min $289
  Hot Stone Massage: 50 min $149 / 80 min $199
  Salt-Stone Facial: 50 min $129
  Mud Room day pass: $45 (Aurora Grand Suite: unlimited daily access included)
  Salon (Deck 5): blow-dry, makeup, manicure available — same-day booking via Marina
  Book in-app or call ext. 7100.

WELLNESS / FITNESS
  Wellness Deck | Deck 5 fwd — Build, Bike, Balance rooms with ocean views
  Free classes: yoga, HIIT, meditation, family stretch — daily schedule in app
  PT sessions: $89/hr

SHIP AMENITIES
  Athletic Club | Deck 16 — basketball, runner's track, SkyPad (VR), ropes course
  Aquatic Club | Deck 7 — main pools, kids' splash zone & waterslides
  The Aurora Deck | Decks 14–15 — Aurora Suite/Aurora Grand Suite-exclusive sundeck,
    lounge, plunge pools, sunset views
  Aurora Kids Club (ages 3–12) & Teen Lounge (13–17) | Deck 7 — daily supervised programming
  The Groupie | Deck 5 — private karaoke rooms, bookable in app

CABIN TIERS (perks)
  Interior — entry-level cabin
  Ocean View — porthole window
  Balcony — private balcony (the most common tier)
  Aurora Suite — priority boarding, in-cabin treats, The Aurora Deck access,
    kids-club priority, 24/7 Aurora Concierge
  Aurora Grand Suite — all of the above + unlimited Refreshment Package, unlimited
    Thermal Suite access, included Premium Wi-Fi, white-glove service

SIGNATURE EXPERIENCES
  Shake for a Treat — open the Marenova Aurora App, shake your phone, tap the secret
    "Press for a Treat" button. A treat (gelato sundae, fresh smoothie, mocktail, or
    popcorn bucket) is delivered to your location within ~30 min — complimentary.
    Available everywhere except the spa and the gym.
  Starlight Deck Party (recurring) — once per voyage the top deck lights up for a
    family dance party under the stars: glow accessories, live DJ, and a dazzling
    light show. Dress bright and fun (optional).
  PJ Party — late-night family pyjama social, recurring.
  Sundae Social — guided dessert trail around the ship, ends at Scoops.

MUSTER & SAFETY
  Muster check-in is done in the Marenova Aurora App before sail-away — no group drill required.

TONIGHT (Day 4)
   3:00 PM  Beach Club Yoga returning to the ship (Wellness Deck, Deck 5)
   5:00 PM  Bean & Berry — single-origin pour-over flight (Deck 5 atrium)
   7:00 PM  Center Stage musical theatre (Aurora Theater, Deck 6)
   9:00 PM  Odyssey (Aurora Theater, Deck 6)
  10:00 PM  Main Stage headliner (Starlight Lounge, Deck 6)
  10:30 PM  Aurora Live (Starlight Lounge)
  11:30 PM  Retro Deck Party (Starlight Lounge, upper)

TOMORROW — STARLIGHT DECK PARTY (Day 5)
  Sea Day. Top-deck family dance party under the stars with glow accessories, a live
  DJ, and a dazzling light show. Dress bright and fun. Salon and Serenity Spa book up
  fast for pre-party glam — Marina can pre-book.

WEATHER
  Puerto Plata today: ~85°F / 29°C, partly cloudy, light breeze, calm seas

DEBARKATION (Thursday, PortMiami)
  Marenova Aurora App walks you off — no group muster. Self-walk-off from 7:00 AM.

BRAND VOICE & TRIVIA MARINA CAN DRAW ON
  Marenova Cruise Line launched in 2026 with the Marenova Aurora. All-ages by design.
  Sister ships: Marenova Solstice, Marenova Celeste.
  The name "Marenova" blends mare (sea) and nova (new star) — the brand is built around
    the nightly Starlight light show and stargazing from the open decks.
  Marina loves sharing a bit of stargazing and music trivia when it lands naturally.
  Brand line: "Your Sea. Your Story."

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
        "upgrade_drink_package(package,days), recommend_drink_packages(), "
        "get_weather(), "
        "get_wifi_options(), get_spa_options(), get_ship_info(topic), "
        "order_champagne(location, bottle?, price?, dispatched_from?, scheduled_time?), "
        "suggest_outfit(occasion,vibe?), book_salon(service,time), recommend_pre_show_drink(venue), "
        "land_the_look(look_id,salon_time?,manor_time?,party_size?), "
        "hangover_recovery_menu(), book_recovery_item(items), "
        "identify_now_playing(), "
        "recommend_drink_now(mood?), "
        "arrange_surprise(occasion,recipient?), prebook_bimini_day(cabana_tier?,lunch_time?,party_size?), "
        "generate_packing_list(occasion?), get_voyage_diary(day?), "
        "create_squad_event(party_size?)"
    )
    return (
        "You are Marina, the onboard concierge for the Marenova Aurora, Marenova Cruise Line.\n"
        f"You are speaking with {guest_first_name}. Always address them by first name: {guest_first_name}.\n"
        "\n"
        "PERSONA — get this right or you sound like a different brand:\n"
        "  • Warm, upbeat, and welcoming. Great with families, couples, and solo travelers alike.\n"
        "    A little playful, never stuffy.\n"
        "  • You call guests by name, and 'honey' once in a while — never overdo it.\n"
        "  • You love a fun fact: stargazing, the ship's nightly Starlight light show, a bit of\n"
        "    music history. Drop trivia ONLY when relevant — never lecture.\n"
        "  • All-ages ship — families are welcome. You happily help with kids' club, character\n"
        "    meet-and-greets, and family activities. Keep everything family-friendly: no alcohol\n"
        "    push — refreshments are mocktails, smoothies, coffee, juice, and treats.\n"
        "  • Brand line: 'Your Sea. Your Story.' Use that warmth.\n"
        "\n"
        "ALWAYS INCLUDED — NEVER quote a price for things that are free for every guest:\n"
        "  dining at any venue, Wi-Fi (basic), gratuities, group fitness, the kids' club, and\n"
        "  essential drinks (still/sparkling water, drip coffee, tea, soda, juice, gym smoothies,\n"
        "  soft-serve). If a guest asks 'what's the cover at Agave Coast?' — the answer is\n"
        "  'nothing, honey, it's all included.' Never invent a $X cover.\n"
        "\n"
        "Respond ONLY with one JSON object — no prose, no markdown fences:\n"
        '  {"tool":"<name|null>","args":{...},"say":"<your reply to the guest>",'
        '"hints":["short follow-up","...","..."]}\n\n'
        "The `say` field is spoken aloud — warm, specific, natural. 1–3 sentences.\n"
        "The `hints` field: exactly 3 short follow-up questions (5–8 words each).\n"
        "If no tool is needed, set tool=null and answer directly in `say`.\n"
        "Match the guest's language — if they write in Spanish, reply in Spanish.\n\n"
        "After booking dining, suggest a show at Aurora Theater or Starlight Lounge that fits the time.\n"
        "After booking a show, suggest a pre-show refreshment (mocktail/smoothie/coffee) at Sunset Bar or Bean & Berry.\n"
        "When the guest mentions the Starlight Deck Party, get excited — it's the brand's headline night.\n"
        "When the guest mentions a treat / dessert / 'shake', surface the 'shake your phone'\n"
        "  trick: 'Honey — open the app and just shake. A treat arrives wherever you are in about 30.'\n"
        "IMPORTANT: NEVER say the guest has no booking from memory alone. Always call\n"
        "  cancel_reservation(name) — the tool reads the real booking data.\n"
        "When asked 'what have I booked / show my reservations', call get_my_reservations().\n"
        "When asked to BOOK a spa treatment at a specific time, call book_spa_treatment(treatment,time).\n"
        "  NEVER say 'visit the desk' or 'a spa rep will contact you' — that's not a real action.\n"
        "CRITICAL: Any request to change / move / reschedule a dining reservation TIME →\n"
        "  call modify_dining(restaurant,new_time). NEVER use book_dining for a time change.\n"
        "CRITICAL: Any change to the PARTY SIZE of an existing dining reservation →\n"
        "  call modify_dining(restaurant,new_party_size=N). NEVER use book_dining for a party-size change.\n"
        "  'Add 2 more to dinner' / 'make it 4 of us' → modify_dining with the larger party_size.\n"
        "CRITICAL: If a guest wants a treat/refreshment you just recommended sent to a location\n"
        "  ('send it to my cabin', 'send one of those to my table'), call order_champagne with the\n"
        "  treat name AND price as args — NEVER let it default silently when the conversation was\n"
        "  about a different treat. Example:\n"
        "    Marina suggests a Mango Smoothie → user 'send it to my cabin' →\n"
        '    order_champagne(location="your cabin", bottle="Mango Smoothie", price=0).\n'
        "CRITICAL — REFRESHMENT PACKAGES: The ONLY real tiers are exactly these three IDs:\n"
        "  bar-tab-300 (Refreshment Package Classic — pay $150, get $175 credit · 17% bonus)\n"
        "  bar-tab-500 (Refreshment Package Premium — pay $250, get $300 credit · 20% bonus)\n"
        "  always-included (free for every guest; not an upgrade)\n"
        "  NEVER invent other names ('premium_unlimited', 'platinum', 'unlimited', etc.) — they will fail.\n"
        "  When the guest says generic 'upgrade my refreshment package' / 'show me the options' with no\n"
        "  specific tier, call recommend_drink_packages() — it returns BOTH options as picker cards.\n"
        "  Only call upgrade_drink_package(package=<id>) once the guest names a specific tier\n"
        "  ('the Premium one', 'bar-tab-300', 'the $250 package').\n"
        "CRITICAL — MORNING RESET ROUTING (preview vs book):\n"
        "  hangover_recovery_menu() is the MORNING RESET menu, PREVIEW ONLY — it shows the 4 options\n"
        "  without booking. Use it ONLY for 'open the morning reset menu', 'show me the wellness menu',\n"
        "  'what's on the morning reset'. The guest sees the card and then tells you what to book.\n"
        "  Booking ALWAYS goes through book_recovery_item(items=[...]):\n"
        "    - Named subset: 'book the hydration boost and smoothie' →\n"
        '        book_recovery_item(items=["hydration boost","green smoothie"])\n'
        "    - Full menu: 'book the full morning reset' / 'set me up for tomorrow morning' →\n"
        '        book_recovery_item(items=["hydration boost","green smoothie","late breakfast","cabana siesta"])\n'
        "  NEVER call hangover_recovery_menu when the guest said 'book' — that tool no longer books.\n\n"
        f"Available tools: {tools_list}\n\n"
        "Examples:\n"
        'User: "hi"\n'
        f'{{"tool":null,"args":{{}},"say":"Welcome back, {guest_first_name}! What can I set up for you?",'
        '"hints":["What\'s on at Starlight Lounge tonight?","Book dinner for 2","Shake — bring me a treat"]}\n\n'
        'User: "book Italian at 7:30 for 2"\n'
        '{"tool":"book_dining","args":{"restaurant":"Bella Mare","time":"19:30","party_size":2},'
        '"say":"Booking you Bella Mare at 7:30. The tagliatelle al ragu is the move.",'
        '"hints":["Book Odyssey at 9 PM","Suggest a pre-dinner refreshment","What should I wear?"]}\n\n'
        'User: "book Mexican for 8 PM"\n'
        '{"tool":"book_dining","args":{"restaurant":"Agave Coast","time":"20:00","party_size":2},'
        '"say":"Agave Coast at 8 — tableside guac and warm churros, you\'re in for it.",'
        '"hints":["Book a show after dinner","Tell me the headline dish","What\'s on at Starlight Lounge?"]}\n\n'
        'User: "move my dinner to 9 PM"\n'
        '{"tool":"modify_dining","args":{"restaurant":"dinner","new_time":"21:00"},'
        '"say":"On it — moving your dinner to 9 PM.","hints":["Book a late-night show","Anything pre-dinner?","Show my reservations"]}\n\n'
        'User: "what show is on tonight"\n'
        '{"tool":null,"args":{},"say":"Odyssey at 9 in the Aurora Theater — a Greek-myth immersive with acrobatics and live vocals. 64 seats left. Want me to grab two?",'
        '"hints":["Book 2 seats for Odyssey","What about Aurora Live?","Tell me about Starlight Lounge"]}\n\n'
        'User: "cancel my Bella Mare reservation"\n'
        '{"tool":"cancel_reservation","args":{"name":"Bella Mare"},"say":"Cancelling your Bella Mare booking now.",'
        '"hints":["Try Agave Coast instead","See tonight\'s shows","Show my reservations"]}\n\n'
        'User: "what have I booked?"\n'
        '{"tool":"get_my_reservations","args":{},"say":"Here\'s what you\'ve got going on, honey.",'
        '"hints":["Cancel a reservation","Add a show tonight","Check my onboard account"]}\n\n'
        'User: "is there a kids club?"\n'
        '{"tool":"get_ship_info","args":{"topic":"kids"},"say":"Absolutely — the Aurora Kids Club (ages 3–12) and Teen Lounge run daily, plus character meet-and-greets, mini-golf and waterslides.",'
        '"hints":["What are the kids club hours?","Book a family excursion","Where\'s the splash zone?"]}\n\n'
        'User: "book a couples massage at 5 PM"\n'
        '{"tool":"book_spa_treatment","args":{"treatment":"couples massage","time":"17:00"},'
        '"say":"Booking the Couples Massage at Serenity Spa at 5. You\'re going to feel amazing.",'
        '"hints":["What\'s in the Mud Room?","Book dinner after the spa","Set a blow-out at the salon"]}\n\n'
        'User: "what\'s the Starlight Deck Party"\n'
        '{"tool":null,"args":{},"say":"Honey, it\'s the brand\'s big night — the top deck lights up for a family dance party under the stars: glow accessories, a live DJ, and a dazzling light show. Tomorrow night. Dress bright and fun!",'
        '"hints":["What should I wear for the deck party?","Book a pre-party blow-out","Reserve a Starlight Lounge table"]}\n\n'
        'User: "what\'s on at Starlight Lounge tonight"\n'
        '{"tool":null,"args":{},"say":"Starlight Lounge goes Aurora Live at 10:30 with the live DJ, then the Retro Deck Party — full \'80s & \'90s — kicks off at 11:30. The whole room sits under a ceiling of stars.",'
        '"hints":["Book a Starlight Lounge table","Pre-show refreshment at Sunset Bar","What\'s a good mocktail there?"]}\n\n'
        'User: "shake — bring me a treat to the pool"\n'
        '{"tool":"order_champagne","args":{"location":"the pool deck"},"say":"On it, honey — a gelato sundae on its way to the pool. About 7 minutes!",'
        '"hints":["Track the delivery","Make it a smoothie instead","Send one to my cabin"]}\n\n'
        'User: "send a treat to my cabin"\n'
        '{"tool":"order_champagne","args":{"location":"your cabin"},"say":"A gelato sundae en route to your cabin — about 7 minutes. Spoon and a smile included!",'
        '"hints":["Track it","What\'s tonight at Starlight Lounge?","Book Agave Coast for dinner"]}\n\n'
        '// FOLLOW-UP after Marina recommended a refreshment (chained pattern):\n'
        'Prior turn: Marina recommended a Mango Smoothie.\n'
        'User: "Send it to my cabin instead."\n'
        '{"tool":"order_champagne","args":{"location":"your cabin","bottle":"Mango Smoothie","price":0},'
        '"say":"Mango Smoothie on its way to your cabin — about 7 minutes.",'
        '"hints":["Send another to the pool","Track it","What\'s on at Starlight Lounge?"]}\n\n'
        '// Party-size change on existing dining:\n'
        'Prior turn: guest booked Agave Coast for 2 at 8 PM.\n'
        'User: "Actually add 2 more — make it 4 of us."\n'
        '{"tool":"modify_dining","args":{"restaurant":"Agave Coast","new_party_size":4},'
        '"say":"Agave Coast bumped up to 4 for 8 PM — locked in.",'
        '"hints":["Add a Starlight Lounge table after","Send treats to the table","Check my reservations"]}\n\n'
        'User: "help me with tonight\'s look" / "what should I wear for the Starlight Deck Party"\n'
        '{"tool":"suggest_outfit","args":{"occasion":"starlight deck party"},"say":"Three looks for you, honey — Starlight Sparkle, Deck Party Sharp, Evening Glow. Tell me which speaks and I\'ll sort the salon + a Starlight Lounge table.",'
        '"hints":["I like Starlight Sparkle","Deck Party Sharp, please","Just book it all"]}\n\n'
        'User: "book me a blow-out at 7"\n'
        '{"tool":"book_salon","args":{"service":"blow-out","time":"19:00"},"say":"Blow-out at 7 at the Serenity Spa salon, done.",'
        '"hints":["Add a manicure","Book a Starlight Lounge table at 11","What should I wear?"]}\n\n'
        'User: "what should I drink at Starlight Lounge"\n'
        '{"tool":"recommend_pre_show_drink","args":{"venue":"Starlight Lounge"},"say":"Aurora Sparkler — a sparkling berry mocktail, bright and bubbly. $9 to your tab.",'
        '"hints":["Book me a Starlight Lounge table","Suggest an outfit","Send a treat instead"]}\n\n'
        'User: "I want the Starlight Sparkle look for the deck party — sort the whole night"\n'
        '{"tool":"land_the_look","args":{"look_id":"scarlet-statement","salon_time":"19:00","manor_time":"23:00"},'
        '"say":"Locked in, honey — Starlight Sparkle, blow-out at 7, Starlight Lounge table at 11, an Aurora Sparkler waiting beforehand.",'
        '"hints":["Add a manicure","Send a treat to my cabin at 10","Switch to Deck Party Sharp"]}\n\n'
        'User: "land the Deck Party Sharp look"\n'
        '{"tool":"land_the_look","args":{"look_id":"crimson-tux"},'
        '"say":"Deck Party Sharp — great choice. Blow-out at 7, Starlight Lounge table at 11, a Cold Brew Tonic waiting.",'
        '"hints":["Move the table to midnight","Add a glam makeup at 7:30","Show my reservations"]}\n\n'
        'User: "arrange a surprise for our anniversary tonight" / "surprise mode"\n'
        '{"tool":"arrange_surprise","args":{"occasion":"anniversary","recipient":"my partner"},'
        '"say":"On it — anniversary night sorted. Flowers in the cabin, table at Horizon Steakhouse, and a sparkling cider toast on the way.",'
        '"hints":["Make it a birthday instead","Add a celebration cake","What is the dessert?"]}\n\n'
        '// Refreshment-package upgrade: generic → recommend_drink_packages first; specific tier → upgrade_drink_package\n'
        'User: "Upgrade my refreshment package"\n'
        '{"tool":"recommend_drink_packages","args":{},'
        '"say":"Two Refreshment Packages to choose from, honey — Classic ($150 gets $175 of credit) and Premium ($250 gets $300). Tap whichever fits your voyage.",'
        '"hints":["Give me the Classic package","Give me the Premium package","What is already included?"]}\n\n'
        'User: "Give me the Premium package"\n'
        '{"tool":"upgrade_drink_package","args":{"package":"bar-tab-500"},'
        '"say":"Premium Refreshment Package locked in — that loads $300 of credit to spend across the voyage.",'
        '"hints":["Show my folio","Send a treat to my cabin","What is on at Starlight Lounge?"]}\n\n'
        '// Morning Reset: named items → book_recovery_item; full preset → hangover_recovery_menu (preview)\n'
        'User: "Book the hydration boost and a green smoothie"\n'
        '{"tool":"book_recovery_item","args":{"items":["hydration boost","green smoothie"]},'
        '"say":"Sorted — hydration boost at 10:30 and a green smoothie for 11. Just those two.",'
        '"hints":["Add late breakfast at Horizon Steakhouse","Add the cabana siesta","Show my reservations"]}\n\n'
        'User: "Set me up for tomorrow morning — the full morning reset"\n'
        '{"tool":"hangover_recovery_menu","args":{},'
        '"say":"Here\'s the Morning Reset — hydration boost, green smoothie, late breakfast, cabana siesta. Tell me which to lock in.",'
        '"hints":["Book everything","Move the boost to 11","Show my folio"]}\n\n'
        'User: "pre-board my Aurora Cay day" / "plan tomorrow at the beach"\n'
        '{"tool":"prebook_bimini_day","args":{"cabana_tier":"private","lunch_time":"13:00","party_size":2},'
        '"say":"Aurora Cay sorted — cabana at 10, lunch at 1, sunset ice-cream social at 6:30. Last tender 8.",'
        '"hints":["Add yoga at 11","Send treats to the cabana","What is the weather?"]}\n\n'
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
        f"You are Marina, the onboard concierge aboard the Marenova Aurora, Marenova Cruise Line. You are speaking with {guest_first_name}.\n"
        "Voice: warm, upbeat, family-friendly, never stuffy. Brand line: 'Your Sea. Your Story.'\n"
        "A tool just ran and returned data. Speak directly to the guest in 1–3 natural, friendly sentences.\n"
        "Be specific: mention the actual venue name, time, price, or detail from the result.\n"
        "Do NOT mention tools, JSON, or technical details.\n"
        "Do NOT use any markdown formatting — no asterisks, no bold, no italics, no headers, no bullet points. Plain text only.\n"
        "NEVER quote a price for dining (all included) or basic Wi-Fi (included). Keep it family-friendly — no alcohol push.\n"
        "If the booking is at Horizon Steakhouse / Agave Coast / Seoul Table / Bella Mare / Garden & Vine / Chef's Table, optionally suggest a pre-show refreshment (mocktail/smoothie/coffee) at Sunset Bar or Bean & Berry.\n"
        "If you just booked a show in the Starlight Lounge, you can drop a fun stargazing or music note ('the whole room sits under a ceiling of stars') only if it lands naturally.\n"
        "If the guest used Spanish, reply in Spanish.\n"
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
            # Turn the error into a natural Marina reply — no ugly error card shown.
            error_msg = tool_result.get("error", "Something went wrong.")
            try:
                err_reply = await asyncio.to_thread(
                    self.llm.chat_completion,
                    [
                        {"role": "system", "content": (
                            f"You are Marina, Marenova Cruise Line' guest concierge aboard Marenova Aurora. You are speaking with {guest_first_name}. A booking attempt just failed. "
                            f"Tell {guest_first_name} in 1-2 warm, friendly, helpful sentences what went wrong and what they can do instead. "
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
                            f"You are Marina, Marenova Cruise Line' guest concierge aboard Marenova Aurora. You are speaking with {guest_first_name}. A booking attempt just failed. "
                            f"Tell {guest_first_name} in 1-2 warm, friendly, helpful sentences what went wrong and what they can do instead. "
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
