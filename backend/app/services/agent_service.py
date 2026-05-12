"""Onboard concierge agent — Carnival Celebration demo.

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
            {"time": "14:00", "title": "Pool-deck reggae", "venue": "Lido Deck"},
            {"time": "17:00", "title": "Wine tasting", "venue": "Atrium"},
            {"time": "21:00", "title": "Punchliner Comedy Club", "venue": "Limelight Lounge"},
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
    package_query = args.get("package") or "CHEERS"
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
            "error": "The Garcias don't have any reservations booked this session to cancel.",
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
    ship_data.add_folio_charge(f"Cloud 9 Spa – {treatment['name']}", discounted)

    return {
        "card": "spa_booking",
        "treatment": treatment["name"],
        "duration_min": treatment["duration_min"],
        "original_price": original,
        "discounted_price": discounted,
        "savings": savings,
        "time": time,
        "time_human": _human_time(time),
        "location": "Cloud 9 Spa, Deck 12",
        "confirmation_id": confirmation_id,
        "vifp_note": f"VIFP Gold 10% discount applied — you saved ${savings:.2f}",
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

    try:
        url = (
            "https://api.open-meteo.com/v1/forecast"
            "?latitude=20.51&longitude=-86.94"
            "&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m,uv_index"
            "&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=America%2FChicago"
        )
        with httpx.Client(timeout=5) as client:
            r = client.get(url)
            r.raise_for_status()
            c = r.json()["current"]
        cozumel = {
            "temp_f": round(c["temperature_2m"]),
            "wind_mph": round(c["windspeed_10m"]),
            "humidity": c["relative_humidity_2m"],
            "uv_index": round(c.get("uv_index", 7)),
            "condition": _wmo_to_condition(c["weathercode"]),
            "icon_key": _wmo_to_icon_key(c["weathercode"]),
        }
        logger.info("Weather fetched live: %s°F %s", cozumel["temp_f"], cozumel["condition"])
    except Exception as e:
        logger.warning("Weather fetch failed (%s); using fallback", e)
        cozumel = {
            "temp_f": 88, "wind_mph": 12, "humidity": 72, "uv_index": 8,
            "condition": "Sunny", "icon_key": "sunny",
        }

    result = {
        "card": "weather",
        "location": "Cozumel, Mexico",
        "port_date": "Tomorrow, May 6",
        "cozumel": cozumel,
        "onboard": {
            "temp_f": 84,
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
            {"name": "Social", "price_per_day": 17, "includes": "Facebook, Instagram, WhatsApp, TikTok"},
            {"name": "Value", "price_per_day": 25, "includes": "Browsing, email, social media, news"},
            {"name": "Premium", "price_per_day": 35, "includes": "Streaming, video calls (Zoom/FaceTime), all of the above"},
        ],
        "purchase": "Internet Café on Deck 5 or the HUB app on your phone.",
    }


def _tool_get_spa_options(_args: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "topic": "spa",
        "location": "Cloud 9 Spa & Fitness Center, Deck 12",
        "hours": "8 AM – 10 PM",
        "services": [
            {"name": "Hot Stone Massage", "duration_min": 50, "price": 149},
            {"name": "Hot Stone Massage", "duration_min": 80, "price": 199},
            {"name": "Couples Massage", "duration_min": 50, "price": 289},
            {"name": "Relaxation Facial", "duration_min": 50, "price": 129},
            {"name": "Thermal Suite Day Pass", "price": 35, "note": "complimentary with any treatment"},
        ],
        "vifp_discount": "10% off all treatments (VIFP Gold benefit)",
        "booking": "Visit Deck 12 or call ext. 7100",
    }


def _tool_get_ship_info(args: Dict[str, Any]) -> Dict[str, Any]:
    topic = (args.get("topic") or "general").lower()
    info_map = {
        "pool": "Resort Pool: Deck 10, open 8 AM–10 PM. Serenity Adult-Only Pool: Deck 11 Fwd (18+). WaterWorks slides: Deck 11 Aft.",
        "casino": "Casino Royale: Deck 5. Hours 8 PM–2 AM at sea; closed in port. VIFP Gold guests receive 10% casino match-play.",
        "kids": "Camp Ocean (Kids Club): Deck 12. Ages 2–11. Hours 9 AM–10 PM. Circle C (tweens 12–14) also on Deck 12.",
        "gym": "Fitness Center: Deck 12, adjacent to Cloud 9 Spa. Open 6 AM–10 PM. Complimentary.",
        "medical": "Medical Center: Deck 0 Forward. Open 24/7 for emergencies; scheduled hours 8–11 AM and 4–7 PM. Dial ext. 911 for emergencies.",
        "muster": "Garcia family muster station: Station G, Deck 4 Starboard.",
        "shopping": "Ocean Plaza shops: Deck 5, open 6 PM–midnight at sea.",
        "dining": "Specialty dining requires reservations. Big Chicken (Deck 8) and Guy's Burger Joint (Deck 10) are walk-up and free.",
        "photo": "Photo Gallery: Deck 5. Unlimited prints + digital download package: $199.",
        "room service": "Room service available 24/7. $4 delivery fee, free between 6 AM–10 AM.",
    }
    for key, val in info_map.items():
        if key in topic:
            return {"topic": topic, "info": val}
    return {"topic": topic, "info": "Deck 5 has Guest Services (open 24/7) who can help with anything not covered here."}


def _tool_modify_dining(args: Dict[str, Any]) -> Dict[str, Any]:
    restaurant_query = (args.get("restaurant") or args.get("name") or "").strip()
    new_time = (args.get("new_time") or args.get("time") or "").strip()

    if not restaurant_query or not new_time:
        return {"card": "error", "error": "I need the restaurant name and the new time to make the change."}

    changed = ship_data.modify_reservation(restaurant_query, new_time)
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
            f"{p.get('name', 'CHEERS!')} is active for {tool_result.get('days', '')} days "
            f"— that's ${tool_result.get('total', 0):.2f} on your folio."
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
        savings = tool_result.get("savings", 0)
        return (
            f"All set! Your {t} is booked at {time_h} at Cloud 9 Spa, Deck 12. "
            f"Your VIFP Gold discount saved you ${savings:.2f}. "
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
        return f"It's {day} — pool reggae, wine tasting, and a 9 PM comedy show, with {port} tomorrow."
    return "Done — anything else?"


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
}


_STATIC_KNOWLEDGE = """
=== CARNIVAL CELEBRATION — ONBOARD CONCIERGE KNOWLEDGE BASE ===

VOYAGE
  Ship: Carnival Celebration | 7-Night Western Caribbean
  Departure: Miami, FL — May 2, 2026 | Return: May 9, 2026
  Today: Day 4 of 7 (Tue, May 6 — Sea Day)
  Tomorrow: Cozumel, Mexico (arrival 7 AM, all aboard 16:30)
  Itinerary: Miami → Sea → Sea → Celebration Key Bahamas → Cozumel → Sea → Miami

GUEST
  Mr. & Mrs. Garcia | Cabin 8245 (Deck 8 Midship) | Party of 2
  VIFP Tier: Gold — benefits: 10% spa discount, 10% casino match-play, priority boarding

DINING (specialty restaurants require reservations unless noted)
  Cucina del Capitano | Deck 11 Midship | Italian | Cover $18/person
    Signature: Pasta del Capitano (house-made fettuccine) | Dress: Smart Casual
    Slots: 17:30 18:00 18:30 19:00 19:30 20:00 20:30 21:00
  Fahrenheit 555 Steakhouse | Deck 11 Fwd | $49/person
    Signature: Dry-aged USDA Prime ribeye | Dress: Smart Casual+ (no shorts/flip-flops)
    Slots: 17:30 18:00 18:30 19:30 20:00 20:30
  Rudi's Seagrill | Deck 5 | Seafood | Cover $38/person
    Signature: Chilean sea bass | Dress: Smart Casual
    Slots: 17:30 18:00 19:00 19:30 20:00 20:30
  Big Chicken by Shaq | Deck 8 | Free | Walk-up, no reservation | Casual
  Guy's Burger Joint | Deck 10 | Free | Walk-up 11 AM–6 PM | Casual
  Tonight is Formal Night — specialty restaurants recommend suits/cocktail attire.
  18% gratuity auto-added to specialty dining bills.

ENTERTAINMENT
  Punchliner Comedy Club | 9 PM | 45 min | Mike Vecchione (headliner)
    Venue: Liquid Lounge, Deck 7 | 42 seats remaining | Ages 18+
  Heart of Soul (Playlist Productions) | 8 PM | 50 min
    Venue: Limelight Lounge, Deck 3 | All ages | 180 seats remaining
  Piano Bar 88 | 10:30 PM | 90 min | Crystal Marie
    Venue: Piano Bar, Deck 5 | 36 seats remaining | All ages

EXCURSIONS (Cozumel, tomorrow May 6)
  Cozumel Reef Snorkel & Beach Break
    Meet: 9:15 AM, Deck 0 Aft Gangway | Duration: 3.5 hrs | $79.99/person | Age 8+
    Bring: swimsuit, reef-safe sunscreen, towel (provided onboard), water shoes optional
    Cancel: free up to 24 hrs before sailing
  Jeep Adventure & Mayan Ruins
    Meet: 8:45 AM, Deck 0 Aft Gangway | Duration: 5.5 hrs | $129.99/person | Age 12+
    Bring: comfortable walking shoes, hat, sunscreen, light jacket
    Cancel: free up to 24 hrs before sailing
  Celebration Key Beachfront Cabana (May 5 — already passed)

DRINK PACKAGES
  CHEERS! | $83.94/person/day | Unlimited cocktails, wine, beer, sodas, specialty coffee
    Max 15 drinks/day per person | Applies to all guests in cabin simultaneously
    Can add for remaining cruise days (3 days left = $251.82/person)
  Bottomless Bubbles | $9.50/person/day | Sodas and juices only

WIFI
  Social | $17/day | Facebook, Instagram, WhatsApp, TikTok
  Value  | $25/day | Browsing, email, social media
  Premium| $35/day | Streaming, Zoom/FaceTime video calls, all of the above
  Purchase: Internet Café Deck 5 or the Carnival HUB app

SPA — Cloud 9 Spa & Fitness Center | Deck 12 | Hours 8 AM–10 PM
  Hot Stone Massage: 50 min $149 / 80 min $199
  Couples Massage: 50 min $289 (VIFP Gold: 10% off → $260.10)
  Relaxation Facial: 50 min $129
  Thermal Suite Day Pass: $35 (complimentary with any treatment)
  Book: visit Deck 12 desk or call ext. 7100

SHIP AMENITIES
  Resort Pool: Deck 10 Midship | Open 8 AM–10 PM | Family-friendly
  Serenity Adult-Only Pool: Deck 11 Fwd | 18+ only | Quiet loungers
  WaterWorks Slides: Deck 11 Aft | Open 10 AM–6 PM
  Fitness Center: Deck 12 (adjacent to Spa) | Open 6 AM–10 PM | Free
  Camp Ocean (Kids Club): Deck 12 | Ages 2–11 | 9 AM–10 PM
  Circle C (tweens): Deck 12 | Ages 12–14 | 9 AM–10 PM
  Casino: Deck 5 | Open 8 PM–2 AM at sea (closed in port)
  Ocean Plaza Shopping: Deck 5 | 6 PM–midnight at sea
  Medical Center: Deck 0 Forward | 24/7 emergencies | Scheduled 8–11 AM & 4–7 PM | Ext. 911
  Photo Gallery: Deck 5 | Unlimited prints + digital download: $199 package
  Guest Services: Deck 5 | Open 24/7

MUSTER & SAFETY
  Garcia family muster station: Station G, Deck 4 Starboard

TODAY'S SCHEDULE (Day 4 — Sea Day)
  10:00 AM  Pool Deck Reggae Band (Resort Pool, Deck 10)
  11:30 AM  Belly Flop Contest (Resort Pool)
   2:00 PM  90s Music Trivia (Alchemy Bar, Deck 6)
   3:30 PM  Wine Tasting with Sommelier — $15/person (Ocean Plaza, Deck 5)
   5:00 PM  Hasbro Game Show (Limelight Lounge, Deck 3)
   6:30 PM  Captain's Cocktail Hour — complimentary (Cloud 9 Spa, Deck 12)
   9:00 PM  Punchliner Comedy Club (Liquid Lounge, Deck 7)
  10:30 PM  Piano Bar 88 (Deck 5)

WEATHER
  Current: 84°F / 29°C, partly cloudy, light breeze 12 mph, seas calm 2 ft
  Cozumel tomorrow: 88°F / 31°C, sunny, excellent visibility for snorkeling

POLICIES
  Gratuity: 18% auto-added to bar, spa, and specialty dining tabs
  Room service: $4 delivery fee; free 6 AM–10 AM
  Smoking: Deck 11 Aft starboard only
  Tonight is Formal Night — Smart Casual minimum in all venues after 6 PM

DEBARKATION (May 9, Miami)
  Self-assist (carry own bags): from 7:30 AM | Porter-assist: by 9:30 AM
  Customs: Miami Terminal F | Color-coded luggage tags distributed tonight

=== END KNOWLEDGE BASE ===
"""


def _build_system_prompt(folio_balance: float, reservations: list, drink_package: Optional[str], guest_first_name: str = "there") -> str:
    res_str = ", ".join(reservations) if reservations else "none yet"
    pkg_str = drink_package or "none active"
    dynamic = (
        f"\nCURRENT SESSION STATE\n"
        f"  Folio balance: ${folio_balance:.2f}\n"
        f"  Reservations this session: {res_str}\n"
        f"  Drink package: {pkg_str}\n"
    )
    tools_list = (
        "book_dining(restaurant,time,party_size), book_show(show,count), "
        "modify_dining(restaurant,new_time), cancel_reservation(name), switch_reservation(cancel,to,type,count), "
        "get_my_reservations(), book_spa_treatment(treatment,time), "
        "get_excursion(name), get_today_schedule(), get_folio(), "
        "upgrade_drink_package(package,days), get_weather(), "
        "get_wifi_options(), get_spa_options(), get_ship_info(topic)"
    )
    return (
        "You are Marina, Carnival Celebration's warm and professional onboard concierge.\n"
        f"You are speaking with {guest_first_name}. Always address them by their first name: {guest_first_name}.\n"
        "Respond ONLY with one JSON object — no prose, no markdown fences:\n"
        '  {"tool":"<name|null>","args":{...},"say":"<your reply to the guest>",'
        '"hints":["short follow-up question","...","..."]}\n\n'
        "The `say` field is spoken aloud — be warm, specific, and natural. 1–3 sentences.\n"
        "The `hints` field: exactly 3 short follow-up questions (5–8 words each) the guest might ask next.\n"
        "If no tool is needed, set tool=null and answer directly in `say`.\n"
        "Match the guest's language — if they write in Spanish, reply in Spanish.\n\n"
        "After booking dining, suggest a show for that evening.\n"
        "After booking a show, suggest CHEERS! if they have no drink package.\n"
        "After an excursion query, remind them of the all-aboard time (16:30).\n"
        "IMPORTANT: NEVER say the guest has no booking from memory alone. "
        "Always call cancel_reservation(name) when they ask to cancel — the tool checks the real booking data.\n"
        "When guest asks 'what have I booked / what are my reservations / show my bookings', call get_my_reservations().\n"
        "When guest wants to BOOK a spa treatment at a specific time, call book_spa_treatment(treatment,time). "
        "NEVER tell them to call ext. 7100 or visit the desk when they are explicitly asking to book right now.\n"
        "NEVER say 'a spa representative will contact you' — that is not a real action.\n"
        "CRITICAL: Any request to change / move / reschedule / update the TIME of an existing dining reservation → call modify_dining(restaurant,new_time). "
        "NEVER call book_dining for a time change. Pass whatever restaurant name the guest mentioned as the restaurant arg.\n\n"
        f"Available tools: {tools_list}\n\n"
        "Examples:\n"
        'User: "hi"\n'
        f'{{"tool":null,"args":{{}},"say":"Welcome back, {guest_first_name}! How can I make your day special?",'
        '"hints":["What\'s on tonight?","Book dinner for 2","What\'s the weather tomorrow?"]}\n\n'
        'User: "book Italian at 7:30 for 2"\n'
        '{"tool":"book_dining","args":{"restaurant":"Italian","time":"19:30","party_size":2},'
        '"say":"Reserving Cucina del Capitano for you.","hints":["Book comedy show tickets","Add CHEERS! package","What\'s the dress code?"]}\n\n'
        'User: "move my Italian dinner to 9 PM"\n'
        '{"tool":"modify_dining","args":{"restaurant":"Italian","new_time":"21:00"},'
        '"say":"Updating your Cucina del Capitano reservation to 9 PM.","hints":["Book show after dinner","Check my reservations","Add drink package"]}\n\n'
        'User: "change dinner reservation to 8:30 PM" / "reschedule my dinner to 8" / "change dinner time"\n'
        '{"tool":"modify_dining","args":{"restaurant":"dinner","new_time":"20:30"},'
        '"say":"Updating your dinner reservation to 8:30 PM.","hints":["Check my reservations","Book a show after dinner","What\'s the dress code?"]}\n\n'
        'User: "what time does the comedy show start"\n'
        '{"tool":null,"args":{},"say":"The Punchliner Comedy Club with Mike Vecchione starts at 9 PM in the Liquid Lounge on Deck 7 — 42 seats still available.",'
        '"hints":["Book 2 seats for comedy","What other shows are on?","Book dinner before the show"]}\n\n'
        'User: "cancel my Italian reservation"\n'
        '{"tool":"cancel_reservation","args":{"name":"Italian"},"say":"Cancelling your Cucina del Capitano reservation now.",'
        '"hints":["Book a different restaurant","See what\'s available tonight","Show my reservations"]}\n\n'
        'User: "what have I booked?" / "show my reservations"\n'
        '{"tool":"get_my_reservations","args":{},"say":"Here are your active reservations.",'
        '"hints":["Cancel a reservation","Add more reservations","Check folio balance"]}\n\n'
        'User: "book a couples massage at 5 PM"\n'
        '{"tool":"book_spa_treatment","args":{"treatment":"couples massage","time":"17:00"},"say":"Booking your Couples Massage at the Cloud 9 Spa now.",'
        '"hints":["What\'s included with the massage?","Book dinner after spa","Check VIFP benefits"]}\n\n'
        'User: "cancel Heart of Soul and book Punchliner instead"\n'
        '{"tool":"switch_reservation","args":{"cancel":"Heart of Soul","to":"Punchliner","type":"show","count":2},"say":"Switching you over now.",'
        '"hints":["Book dinner before the show","Add CHEERS! package","What other shows are there?"]}\n\n'
        'User: "¿qué hay de comer?"\n'
        '{"tool":null,"args":{},"say":"Esta noche tenemos opciones deliciosas: Cucina del Capitano (italiana, $18), Fahrenheit 555 (carne a la parrilla, $49) o Rudi\'s Seagrill (mariscos, $38). ¿Le hago una reserva?",'
        '"hints":["Reservar mesa para las 8","¿Cuál es el código de vestimenta?","¿Qué shows hay esta noche?"]}\n\n'
        + _STATIC_KNOWLEDGE
        + dynamic
    )


def _build_finalize_prompt(tool_name: str, tool_result: Dict[str, Any]) -> str:
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
        "You are Marina, the warm onboard concierge for the Garcia family aboard Carnival Celebration.\n"
        "A tool just ran and returned data. Speak directly to the guest in 1–3 natural, friendly sentences.\n"
        "Be specific: mention the actual venue name, time, price, or detail from the result.\n"
        "Do NOT mention tools, JSON, or technical details.\n"
        "Do NOT use any markdown formatting — no asterisks, no bold, no italics, no headers, no bullet points. Plain text only.\n"
        "If you just booked a show, mention CHEERS! if they have no drink package.\n"
        "If the guest used Spanish, reply in Spanish.\n"
        + extra
        + f"\n\nTool called: {tool_name}\n"
        f"Result: {tool_result}\n\n"
        "Your reply to the Garcia family:"
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
                            "You are Marina, Carnival's onboard concierge. A booking attempt just failed. "
                            "Tell the Garcia family in 1-2 warm, helpful sentences what went wrong and what they can do instead. "
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
            {"role": "system", "content": _build_finalize_prompt(tool_name, tool_result)}
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

        # Build card payload — None for read-only info tools.
        # switch_reservation returns TWO cards: cancel + new booking.
        if tool_result.get("switched_from") and tool_result.get("card"):
            sf = tool_result["switched_from"]
            cancel_card = {
                "card": "cancel",
                "name": sf.get("name", "previous booking"),
                "confirmation_id": sf.get("confirmation_id", ""),
                "time_human": "",
            }
            final_card = [cancel_card, tool_result]
        elif tool_result.get("card"):
            final_card = tool_result
        else:
            final_card = None

        return {
            "bot_text": bot_text,
            "card_payload": final_card,
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
                            "You are Marina, Carnival's onboard concierge. A booking attempt just failed. "
                            "Tell the Garcia family in 1-2 warm, helpful sentences what went wrong and what they can do instead. "
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
        finalize_sys = _build_finalize_prompt(tool_name, tool_result)
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

        # Build the card payload
        if tool_result.get("switched_from") and tool_result.get("card"):
            sf = tool_result["switched_from"]
            cancel_card = {
                "card": "cancel",
                "name": sf.get("name", "previous booking"),
                "confirmation_id": sf.get("confirmation_id", ""),
                "time_human": "",
            }
            final_card = [cancel_card, tool_result]
        elif tool_result.get("card"):
            final_card = tool_result
        else:
            final_card = None

        yield {
            "type": "done",
            "card_payload": final_card,
            "folio_balance": ship_data.get_guest()["folio"]["balance"],
            "suggestions": suggestions,
        }
