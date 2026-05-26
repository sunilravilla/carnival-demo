"""Mock Sailor registry for the Virgin Voyages concierge demo.

10 Sailors mapped to phone numbers 9999999990 – 9999999999.
Each entry is deep-copied into ship_data at startup so mutations
during a demo session are isolated per phone number.

Cabin tiers used: Insider, Sea View, Sea Terrace, RockStar, Mega RockStar.
"""

GUEST_REGISTRY = {
    # ── Primary demo Sailor — Sea Terrace, fashion-forward, NYC ─────────────
    "9999999990": {
        "guest_id": "VV-77321",
        "name": "Ms. Vivian Bell",
        "primary_first_name": "Vivian",
        "primary_last_name": "Bell",
        "cabin": "10245",
        "deck": 10,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Sea Terrace",
        "mobile_number": "9999999990",
        "booking_ref": "VV-2026-77321",
        "folio": {
            "balance": 287.50,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-24", "desc": "Beach Club at Bimini — Cabana share", "amount": 112.25},
                {"date": "2026-05-25", "desc": "On The Rocks — 2 cocktails", "amount": 32.00},
                {"date": "2026-05-25", "desc": "Redemption Spa — Salt Therapy", "amount": 65.00},
                {"date": "2026-05-26", "desc": "The Galley — late-night noodles", "amount": 0.00},
                {"date": "2026-05-26", "desc": "Sip — single-origin pour-over x3", "amount": 18.30},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "dining",
                "restaurant_id": "extra-virgin",
                "restaurant_name": "Extra Virgin",
                "time": "19:30",
                "time_human": "7:30 PM",
                "party_size": 2,
                "confirmation_id": "EV73210",
            },
            {
                "kind": "show",
                "show_id": "persephone-9pm",
                "show_name": "Persephone",
                "venue": "The Red Room",
                "time": "21:00",
                "time_human": "9:00 PM",
                "count": 2,
                "confirmation_id": "PE73212",
            },
        ],
    },

    # ── Conflict-detection demo: dinner at 7 PM + show at 7:30 PM ──────────
    "9999999991": {
        "guest_id": "VV-64310",
        "name": "Ms. Elena Reyes",
        "primary_first_name": "Elena",
        "primary_last_name": "Reyes",
        "cabin": "6430",
        "deck": 6,
        "party_size": 1,
        "language_preference": "en",
        "vifp_tier": "Sea View",
        "mobile_number": "9999999991",
        "booking_ref": "VV-2026-64310",
        "folio": {
            "balance": 142.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-24", "desc": "Redemption Spa — Mud Room", "amount": 45.00},
                {"date": "2026-05-25", "desc": "Loose Cannon — natural wine pour", "amount": 14.00},
                {"date": "2026-05-26", "desc": "Sip — flat white x2", "amount": 8.40},
                {"date": "2026-05-26", "desc": "The Manor — Cosmopolitan", "amount": 16.00},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "dining",
                "restaurant_id": "extra-virgin",
                "restaurant_name": "Extra Virgin",
                "time": "19:00",
                "time_human": "7:00 PM",
                "party_size": 1,
                "confirmation_id": "EV64311",
            },
            {
                "kind": "show",
                "show_id": "booked-7pm",
                "show_name": "Booked!",
                "venue": "The Red Room",
                "time": "19:30",
                "time_human": "7:30 PM",
                "count": 1,
                "confirmation_id": "BK64312",
            },
        ],
    },

    # ── Group of 4, Bar Tab active ──────────────────────────────────────────
    "9999999992": {
        "guest_id": "VV-61020",
        "name": "Chen Party",
        "primary_first_name": "Wei",
        "primary_last_name": "Chen",
        "cabin": "6102",
        "deck": 6,
        "party_size": 4,
        "language_preference": "en",
        "vifp_tier": "Sea Terrace",
        "mobile_number": "9999999992",
        "booking_ref": "VV-2026-61020",
        "folio": {
            "balance": 612.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photos x4", "amount": 99.80},
                {"date": "2026-05-24", "desc": "Redemption Spa — Swedish Massage x2", "amount": 340.00},
                {"date": "2026-05-25", "desc": "The Wake x4 — wine pairing", "amount": 168.00},
                {"date": "2026-05-26", "desc": "Bimini Cabana — round 2", "amount": 0.00},
            ],
        },
        "drink_package": {
            "id": "bar-tab-500",
            "days_remaining": 2,
            "total_charged": 500.00,
        },
        "reservations": [
            {
                "kind": "dining",
                "restaurant_id": "the-wake",
                "restaurant_name": "The Wake",
                "time": "20:00",
                "time_human": "8:00 PM",
                "party_size": 4,
                "confirmation_id": "TW61021",
            },
        ],
    },

    # ── Spanish-speaker demo ────────────────────────────────────────────────
    "9999999993": {
        "guest_id": "VV-51500",
        "name": "Sr. Carlos Mendez",
        "primary_first_name": "Carlos",
        "primary_last_name": "Mendez",
        "cabin": "5150",
        "deck": 5,
        "party_size": 1,
        "language_preference": "es",
        "vifp_tier": "Insider",
        "mobile_number": "9999999993",
        "booking_ref": "VV-2026-51500",
        "folio": {
            "balance": 47.00,
            "items": [
                {"date": "2026-05-23", "desc": "Tienda — Artículos varios", "amount": 28.00},
                {"date": "2026-05-25", "desc": "Sip — Café Especialidad x2", "amount": 8.00},
                {"date": "2026-05-26", "desc": "On The Rocks — Cocktail", "amount": 11.00},
            ],
        },
        "drink_package": None,
        "reservations": [],
    },

    # ── Basic couple, Insider cabin ─────────────────────────────────────────
    "9999999994": {
        "guest_id": "VV-72030",
        "name": "Mr. and Mrs. Johnson",
        "primary_first_name": "Robert",
        "primary_last_name": "Johnson",
        "cabin": "7203",
        "deck": 7,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Insider",
        "mobile_number": "9999999994",
        "booking_ref": "VV-2026-72030",
        "folio": {
            "balance": 168.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-24", "desc": "Bimini — Beach beverage round", "amount": 38.00},
                {"date": "2026-05-25", "desc": "Pool Bar — 3 cocktails", "amount": 42.50},
                {"date": "2026-05-26", "desc": "Loose Cannon — bar nibbles", "amount": 22.55},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "show",
                "show_id": "drag-8pm",
                "show_name": "Lights, Camera, Drag!",
                "venue": "The Red Room",
                "time": "20:00",
                "time_human": "8:00 PM",
                "count": 2,
                "confirmation_id": "DR72041",
            },
        ],
    },

    # ── RockStar — Avery Quinn, fashion industry, London ────────────────────
    "9999999995": {
        "guest_id": "VV-90880",
        "name": "Mx. Avery Quinn",
        "primary_first_name": "Avery",
        "primary_last_name": "Quinn",
        "cabin": "14088",
        "deck": 14,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "RockStar",
        "mobile_number": "9999999995",
        "booking_ref": "VV-2026-90880",
        "folio": {
            "balance": 410.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation — RockStar priority", "amount": 0.00},
                {"date": "2026-05-24", "desc": "Redemption Spa — Hot Stone Couples", "amount": 380.00},
                {"date": "2026-05-25", "desc": "The Wake — Krug pairing", "amount": 0.00},
                {"date": "2026-05-26", "desc": "Sip — espresso x2", "amount": 8.00},
                {"date": "2026-05-26", "desc": "Salon — blow-out", "amount": 22.00},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "spa",
                "treatment_name": "Couples Deep Tissue at Redemption Spa",
                "time": "17:00",
                "time_human": "5:00 PM",
                "duration_min": 75,
                "price": 299.00,
                "confirmation_id": "RS90881",
            },
            {
                "kind": "dining",
                "restaurant_id": "the-wake",
                "restaurant_name": "The Wake",
                "time": "19:00",
                "time_human": "7:00 PM",
                "party_size": 2,
                "confirmation_id": "TW90882",
            },
        ],
    },

    # ── Clean slate (solo) — Sea View ──────────────────────────────────────
    "9999999996": {
        "guest_id": "VV-10305",
        "name": "Mr. Marcus Williams",
        "primary_first_name": "Marcus",
        "primary_last_name": "Williams",
        "cabin": "10305",
        "deck": 10,
        "party_size": 1,
        "language_preference": "en",
        "vifp_tier": "Sea View",
        "mobile_number": "9999999996",
        "booking_ref": "VV-2026-10305",
        "folio": {
            "balance": 76.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-25", "desc": "Sip — pour-over x5", "amount": 25.00},
                {"date": "2026-05-26", "desc": "On The Rocks — Negroni", "amount": 16.00},
                {"date": "2026-05-26", "desc": "The Galley — bowl + dumplings", "amount": 0.00},
            ],
        },
        "drink_package": None,
        "reservations": [],
    },

    # ── Show + dining combo — Sea Terrace ───────────────────────────────────
    "9999999997": {
        "guest_id": "VV-11204",
        "name": "Mr. and Mrs. O'Brien",
        "primary_first_name": "Sarah",
        "primary_last_name": "O'Brien",
        "cabin": "11204",
        "deck": 11,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Sea Terrace",
        "mobile_number": "9999999997",
        "booking_ref": "VV-2026-11204",
        "folio": {
            "balance": 245.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-24", "desc": "Redemption Spa — Salt Stone Facial", "amount": 95.00},
                {"date": "2026-05-25", "desc": "On The Rocks x3", "amount": 42.50},
                {"date": "2026-05-26", "desc": "Retail — Virgin Voyages tee", "amount": 47.00},
                {"date": "2026-05-26", "desc": "Sip — flat whites x8", "amount": 34.00},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "show",
                "show_id": "untitled-1030",
                "show_name": "UNTITLED DANCESHOWPARTYTHING",
                "venue": "The Manor",
                "time": "22:30",
                "time_human": "10:30 PM",
                "count": 2,
                "confirmation_id": "UN11241",
            },
            {
                "kind": "dining",
                "restaurant_id": "pink-agave",
                "restaurant_name": "Pink Agave",
                "time": "20:30",
                "time_human": "8:30 PM",
                "party_size": 2,
                "confirmation_id": "PA11242",
            },
        ],
    },

    # ── Mega RockStar high-spender (Richard's Rooftop) ──────────────────────
    "9999999998": {
        "guest_id": "VV-33070",
        "name": "Mr. and Mrs. Tanaka",
        "primary_first_name": "Yuki",
        "primary_last_name": "Tanaka",
        "cabin": "15307",
        "deck": 15,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Mega RockStar",
        "mobile_number": "9999999998",
        "booking_ref": "VV-2026-33070",
        "folio": {
            "balance": 0.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation — Mega RockStar fast-track", "amount": 0.00},
                {"date": "2026-05-24", "desc": "Richard's Rooftop — bar tab (included)", "amount": 0.00},
                {"date": "2026-05-25", "desc": "The Test Kitchen — 7-course pairing", "amount": 0.00},
                {"date": "2026-05-26", "desc": "Salon — Cut, color, blow-out", "amount": 0.00},
                {"date": "2026-05-26", "desc": "Redemption Spa — Hydrotherapy (unlimited)", "amount": 0.00},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "spa",
                "treatment_name": "Mega RockStar Hydrotherapy Day Pass",
                "time": "15:00",
                "time_human": "3:00 PM",
                "duration_min": 180,
                "price": 0.00,
                "confirmation_id": "MR33071",
            },
        ],
    },

    # ── Excursion focus — Sea Terrace ───────────────────────────────────────
    "9999999999": {
        "guest_id": "VV-85010",
        "name": "Mr. and Mrs. Osei",
        "primary_first_name": "Aisha",
        "primary_last_name": "Osei",
        "cabin": "8501",
        "deck": 8,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Sea Terrace",
        "mobile_number": "9999999999",
        "booking_ref": "VV-2026-85010",
        "folio": {
            "balance": 158.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-24", "desc": "Bimini Beach Club — cocktail rounds", "amount": 38.50},
                {"date": "2026-05-25", "desc": "Sip — flat whites x3", "amount": 14.55},
                {"date": "2026-05-26", "desc": "On The Rocks — mezcal flight", "amount": 24.00},
                {"date": "2026-05-26", "desc": "Excursion — Puerto Plata Cocoa x2", "amount": 56.00},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "dining",
                "restaurant_id": "gunbae",
                "restaurant_name": "Gunbae",
                "time": "19:00",
                "time_human": "7:00 PM",
                "party_size": 2,
                "confirmation_id": "GB85011",
            },
        ],
    },
}
