"""Mock ship-data service backing the Carnival onboard concierge demo.

Reads JSON files from app/data/ship/ on import and exposes typed lookups for
the agent's tools. Mutations (booking, drink-package upgrade) are kept in
process memory so they show up in subsequent tool calls within one demo run.

Multi-guest support: set_active_guest(phone) switches the active guest.
Each of the 10 demo phones gets its own isolated mutable copy of guest data.
"""

import copy
import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "ship")


def _load(name: str) -> Any:
    path = os.path.join(_DATA_DIR, f"{name}.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


_cruise = _load("cruise")
_restaurants = _load("restaurants")
_shows = _load("shows")
_excursions = _load("excursions")
_drink_packages = _load("drink_packages")

# ---------------------------------------------------------------------------
# Multi-guest registry — 10 isolated demo guests (phones 9999999990–9999999999)
# ---------------------------------------------------------------------------

from app.data.ship.guests_mock import GUEST_REGISTRY as _GUEST_REGISTRY

# Deep-copy each guest at startup so mutations are isolated per phone.
_guests: Dict[str, Dict[str, Any]] = {
    phone: copy.deepcopy(data) for phone, data in _GUEST_REGISTRY.items()
}

# Default to the primary demo guest.
_current_phone: str = "9999999990"


def _g() -> Dict[str, Any]:
    """Return a direct (mutable) reference to the active guest dict."""
    return _guests[_current_phone]


def set_active_guest(phone: str) -> bool:
    """Switch the active guest by phone number. Returns True if found."""
    global _current_phone
    phone = str(phone).strip()
    if phone in _guests:
        _current_phone = phone
        logger.info("Active guest switched to phone %s (%s)", phone, _guests[phone]["primary_first_name"])
        return True
    logger.warning("Guest lookup failed for phone %s", phone)
    return False


def reset_guest(phone: str) -> bool:
    """Reset a guest's session state to original registry values (for demo restart)."""
    phone = str(phone).strip()
    if phone in _GUEST_REGISTRY:
        _guests[phone] = copy.deepcopy(_GUEST_REGISTRY[phone])
        logger.info("Guest %s reset to original state", phone)
        return True
    return False


def get_active_phone() -> str:
    return _current_phone


# ---------------------------------------------------------------------------
# Read-only lookups
# ---------------------------------------------------------------------------

def _match_one(items: List[Dict[str, Any]], query: str, fields: List[str]) -> Optional[Dict[str, Any]]:
    """Loose case-insensitive match of `query` against any of `fields` on each item."""
    q = (query or "").strip().lower()
    if not q:
        return None
    for item in items:
        for field in fields:
            value = str(item.get(field, "")).lower()
            if q == value or q in value or value in q:
                return item
    for item in items:
        if any(token in str(item.get("name", "")).lower() for token in q.split()):
            return item
    return None


def get_cruise() -> Dict[str, Any]:
    return copy.deepcopy(_cruise)


def get_guest() -> Dict[str, Any]:
    return copy.deepcopy(_g())


def list_restaurants() -> List[Dict[str, Any]]:
    return copy.deepcopy(_restaurants)


def find_restaurant(query: str) -> Optional[Dict[str, Any]]:
    """Match by id, name, cuisine, or 'the Italian place' style fuzzy lookup."""
    item = _match_one(_restaurants, query, ["id", "name", "cuisine"])
    return copy.deepcopy(item) if item else None


def get_all_shows() -> List[Dict[str, Any]]:
    return copy.deepcopy(_shows)


def find_show(query: str) -> Optional[Dict[str, Any]]:
    item = _match_one(_shows, query, ["id", "name", "venue", "headliner"])
    return copy.deepcopy(item) if item else None


def find_excursion(query: str) -> Optional[Dict[str, Any]]:
    item = _match_one(_excursions, query, ["id", "name", "port"])
    return copy.deepcopy(item) if item else None


def find_drink_package(query: str) -> Optional[Dict[str, Any]]:
    item = _match_one(_drink_packages, query, ["id", "name"])
    return copy.deepcopy(item) if item else None


def remaining_cruise_days() -> int:
    """Days remaining including today's evening + future days, used for drink-package math."""
    return max(1, _cruise["total_days"] - _cruise["current_day"])


# ---------------------------------------------------------------------------
# Reservation helpers
# ---------------------------------------------------------------------------

def list_reservations() -> List[Dict[str, Any]]:
    return copy.deepcopy(_g().get("reservations", []))


def remove_reservation(query: str) -> Optional[Dict[str, Any]]:
    """Remove the first reservation whose restaurant_name or show_name matches query.
    Returns the removed entry, or None if nothing matched.
    """
    q = (query or "").strip().lower()
    reservations = _g().get("reservations", [])
    for i, r in enumerate(reservations):
        name = (r.get("restaurant_name") or r.get("show_name") or r.get("treatment_name") or "").lower()
        conf = (r.get("confirmation_id") or "").lower()
        if q in name or name in q or q == conf:
            removed = reservations.pop(i)
            logger.info("Reservation cancelled: %s", removed)
            return copy.deepcopy(removed)
    return None


def _format_time(hhmm: str) -> str:
    """Convert HH:MM → human-readable 12-hour time string."""
    try:
        h, m = hhmm.split(":")
        h_i = int(h)
        suffix = "AM" if h_i < 12 else "PM"
        h_12 = h_i if 1 <= h_i <= 12 else (h_i - 12 if h_i > 12 else 12)
        return f"{h_12}:{m} {suffix}"
    except Exception:
        return hhmm


_DINING_GENERIC_WORDS = frozenset({
    "dinner", "reservation", "booking", "table", "restaurant", "dining", "my", "the", "our", "it"
})


def modify_reservation(query: str, new_time: str) -> Optional[Dict[str, Any]]:
    """Update the time of a dining reservation.

    Strategy:
    - Only 1 dining reservation → always modify it (LLM passes cuisine/generic names
      like "Italian" that won't fuzzy-match the actual restaurant name).
    - Multiple dining reservations → fuzzy match by name, then fall back to first.
    """
    dining = [r for r in _g().get("reservations", []) if r.get("kind") == "dining"]
    if not dining:
        return None

    if len(dining) == 1:
        r = dining[0]
        old_time = r["time"]
        r["time"] = new_time
        r["time_human"] = _format_time(new_time)
        logger.info("Reservation modified (only one): %s %s → %s", r["restaurant_name"], old_time, new_time)
        return {
            "restaurant_name": r["restaurant_name"],
            "old_time": old_time,
            "new_time": new_time,
            "confirmation_id": r.get("confirmation_id", ""),
            "party_size": r.get("party_size", 2),
        }

    q = (query or "").strip().lower()
    q_tokens = [t for t in q.split() if t]
    is_generic = not q_tokens or all(t in _DINING_GENERIC_WORDS for t in q_tokens)

    target = None
    if not is_generic:
        for r in dining:
            name = r.get("restaurant_name", "").lower()
            if q in name or name in q or any(tok in name for tok in q_tokens if len(tok) > 2):
                target = r
                break

    if target is None:
        target = dining[0]

    old_time = target["time"]
    target["time"] = new_time
    target["time_human"] = _format_time(new_time)
    logger.info("Reservation modified: %s %s → %s", target["restaurant_name"], old_time, new_time)
    return {
        "restaurant_name": target["restaurant_name"],
        "old_time": old_time,
        "new_time": new_time,
        "confirmation_id": target.get("confirmation_id", ""),
        "party_size": target.get("party_size", 2),
    }


def add_reservation(kind: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Append a reservation to the in-memory guest folio. Returns the saved entry."""
    entry = {"kind": kind, **payload}
    _g().setdefault("reservations", []).append(entry)
    logger.info("Reservation added: %s", entry)
    return copy.deepcopy(entry)


# ---------------------------------------------------------------------------
# Folio / billing helpers
# ---------------------------------------------------------------------------

def add_folio_charge(desc: str, amount: float, date: Optional[str] = None) -> Dict[str, Any]:
    """Append a folio line item and update the running balance."""
    item = {
        "date": date or _cruise.get("today_label", "Today"),
        "desc": desc,
        "amount": round(amount, 2),
    }
    _g()["folio"]["items"].append(item)
    _g()["folio"]["balance"] = round(_g()["folio"]["balance"] + amount, 2)
    logger.info("Folio charge added: %s = $%.2f (balance now $%.2f)", desc, amount, _g()["folio"]["balance"])
    return copy.deepcopy(item)


def set_drink_package(package_id: str, days: int, total: float) -> Dict[str, Any]:
    """Apply a drink package to the guest profile; folio is updated separately."""
    _g()["drink_package"] = {
        "id": package_id,
        "days_remaining": days,
        "total_charged": round(total, 2),
    }
    return copy.deepcopy(_g()["drink_package"])
