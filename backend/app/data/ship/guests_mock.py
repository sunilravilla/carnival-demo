"""Mock guest registry for the Marenova Aurora concierge demo.

10 guests mapped to phone numbers 9999999990 – 9999999999.
Each entry is deep-copied into ship_data at startup so mutations
during a demo session are isolated per phone number.

Cabin tiers used: Interior, Ocean View, Balcony, Aurora Suite, Aurora Grand Suite.
"""

GUEST_REGISTRY = {
    # ── Primary demo guest — Balcony, fashion-forward, NYC ──────────────────
    "9999999990": {
        "guest_id": "MA-77321",
        "name": "Ms. Vivian Bell",
        "primary_first_name": "Vivian",
        "primary_last_name": "Bell",
        "cabin": "10245",
        "deck": 10,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Balcony",
        "mobile_number": "9999999990",
        "booking_ref": "MA-2026-77321",
        "folio": {
            "balance": 287.50,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-24", "desc": "Aurora Cay — Cabana share", "amount": 112.25},
                {"date": "2026-05-25", "desc": "Sunset Bar — 2 mocktails", "amount": 32.00},
                {"date": "2026-05-25", "desc": "Serenity Spa — Salt Therapy", "amount": 65.00},
                {"date": "2026-05-26", "desc": "The Marketplace — late-night noodles", "amount": 0.00},
                {"date": "2026-05-26", "desc": "Bean & Berry — single-origin pour-over x3", "amount": 18.30},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "dining",
                "restaurant_id": "extra-virgin",
                "restaurant_name": "Bella Mare",
                "time": "19:30",
                "time_human": "7:30 PM",
                "party_size": 2,
                "confirmation_id": "BM73210",
            },
            {
                "kind": "show",
                "show_id": "persephone-9pm",
                "show_name": "Odyssey",
                "venue": "Aurora Theater",
                "time": "21:00",
                "time_human": "9:00 PM",
                "count": 2,
                "confirmation_id": "OD73212",
            },
        ],
    },

    # ── Conflict-detection demo: dinner at 7 PM + show at 7:30 PM ──────────
    "9999999991": {
        "guest_id": "MA-64310",
        "name": "Ms. Elena Reyes",
        "primary_first_name": "Elena",
        "primary_last_name": "Reyes",
        "cabin": "6430",
        "deck": 6,
        "party_size": 1,
        "language_preference": "en",
        "vifp_tier": "Ocean View",
        "mobile_number": "9999999991",
        "booking_ref": "MA-2026-64310",
        "folio": {
            "balance": 142.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-24", "desc": "Serenity Spa — Mud Room", "amount": 45.00},
                {"date": "2026-05-25", "desc": "The Hideaway — fresh lemonade", "amount": 14.00},
                {"date": "2026-05-26", "desc": "Bean & Berry — flat white x2", "amount": 8.40},
                {"date": "2026-05-26", "desc": "Starlight Lounge — berry cooler", "amount": 16.00},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "dining",
                "restaurant_id": "extra-virgin",
                "restaurant_name": "Bella Mare",
                "time": "19:00",
                "time_human": "7:00 PM",
                "party_size": 1,
                "confirmation_id": "BM64311",
            },
            {
                "kind": "show",
                "show_id": "booked-7pm",
                "show_name": "Center Stage",
                "venue": "Aurora Theater",
                "time": "19:30",
                "time_human": "7:30 PM",
                "count": 1,
                "confirmation_id": "CS64312",
            },
        ],
    },

    # ── Family of 4, Refreshment Package active ────────────────────────────
    "9999999992": {
        "guest_id": "MA-61020",
        "name": "Chen Family",
        "primary_first_name": "Wei",
        "primary_last_name": "Chen",
        "cabin": "6102",
        "deck": 6,
        "party_size": 4,
        "language_preference": "en",
        "vifp_tier": "Balcony",
        "mobile_number": "9999999992",
        "booking_ref": "MA-2026-61020",
        "folio": {
            "balance": 612.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photos x4", "amount": 99.80},
                {"date": "2026-05-24", "desc": "Serenity Spa — Swedish Massage x2", "amount": 340.00},
                {"date": "2026-05-25", "desc": "Horizon Steakhouse x4 — dessert flight", "amount": 168.00},
                {"date": "2026-05-26", "desc": "Aurora Cay Cabana — round 2", "amount": 0.00},
            ],
        },
        "drink_package": {
            "id": "bar-tab-500",
            "days_remaining": 2,
            "total_charged": 250.00,
        },
        "reservations": [
            {
                "kind": "dining",
                "restaurant_id": "the-wake",
                "restaurant_name": "Horizon Steakhouse",
                "time": "20:00",
                "time_human": "8:00 PM",
                "party_size": 4,
                "confirmation_id": "HS61021",
            },
        ],
    },

    # ── Spanish-speaker demo ────────────────────────────────────────────────
    "9999999993": {
        "guest_id": "MA-51500",
        "name": "Sr. Carlos Mendez",
        "primary_first_name": "Carlos",
        "primary_last_name": "Mendez",
        "cabin": "5150",
        "deck": 5,
        "party_size": 1,
        "language_preference": "es",
        "vifp_tier": "Interior",
        "mobile_number": "9999999993",
        "booking_ref": "MA-2026-51500",
        "folio": {
            "balance": 47.00,
            "items": [
                {"date": "2026-05-23", "desc": "Tienda — Artículos varios", "amount": 28.00},
                {"date": "2026-05-25", "desc": "Bean & Berry — Café Especialidad x2", "amount": 8.00},
                {"date": "2026-05-26", "desc": "Sunset Bar — Limonada", "amount": 11.00},
            ],
        },
        "drink_package": None,
        "reservations": [],
    },

    # ── Basic couple, Interior cabin ────────────────────────────────────────
    "9999999994": {
        "guest_id": "MA-72030",
        "name": "Mr. and Mrs. Johnson",
        "primary_first_name": "Robert",
        "primary_last_name": "Johnson",
        "cabin": "7203",
        "deck": 7,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Interior",
        "mobile_number": "9999999994",
        "booking_ref": "MA-2026-72030",
        "folio": {
            "balance": 168.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-24", "desc": "Aurora Cay — beach smoothie round", "amount": 38.00},
                {"date": "2026-05-25", "desc": "Pool Bar — 3 mocktails", "amount": 42.50},
                {"date": "2026-05-26", "desc": "The Hideaway — café nibbles", "amount": 22.55},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "show",
                "show_id": "drag-8pm",
                "show_name": "Showstoppers",
                "venue": "Aurora Theater",
                "time": "20:00",
                "time_human": "8:00 PM",
                "count": 2,
                "confirmation_id": "SS72041",
            },
        ],
    },

    # ── Aurora Suite — Avery Quinn, fashion industry, London ────────────────
    "9999999995": {
        "guest_id": "MA-90880",
        "name": "Mx. Avery Quinn",
        "primary_first_name": "Avery",
        "primary_last_name": "Quinn",
        "cabin": "14088",
        "deck": 14,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Aurora Suite",
        "mobile_number": "9999999995",
        "booking_ref": "MA-2026-90880",
        "folio": {
            "balance": 410.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation — Aurora Suite priority", "amount": 0.00},
                {"date": "2026-05-24", "desc": "Serenity Spa — Hot Stone Couples", "amount": 380.00},
                {"date": "2026-05-25", "desc": "Horizon Steakhouse — dessert pairing", "amount": 0.00},
                {"date": "2026-05-26", "desc": "Bean & Berry — espresso x2", "amount": 8.00},
                {"date": "2026-05-26", "desc": "Salon — blow-out", "amount": 22.00},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "spa",
                "treatment_name": "Couples Deep Tissue at Serenity Spa",
                "time": "17:00",
                "time_human": "5:00 PM",
                "duration_min": 75,
                "price": 299.00,
                "confirmation_id": "SP90881",
            },
            {
                "kind": "dining",
                "restaurant_id": "the-wake",
                "restaurant_name": "Horizon Steakhouse",
                "time": "19:00",
                "time_human": "7:00 PM",
                "party_size": 2,
                "confirmation_id": "HS90882",
            },
        ],
    },

    # ── Clean slate (solo) — Ocean View ────────────────────────────────────
    "9999999996": {
        "guest_id": "MA-10305",
        "name": "Mr. Marcus Williams",
        "primary_first_name": "Marcus",
        "primary_last_name": "Williams",
        "cabin": "10305",
        "deck": 10,
        "party_size": 1,
        "language_preference": "en",
        "vifp_tier": "Ocean View",
        "mobile_number": "9999999996",
        "booking_ref": "MA-2026-10305",
        "folio": {
            "balance": 76.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-25", "desc": "Bean & Berry — pour-over x5", "amount": 25.00},
                {"date": "2026-05-26", "desc": "Sunset Bar — berry fizz", "amount": 16.00},
                {"date": "2026-05-26", "desc": "The Marketplace — bowl + dumplings", "amount": 0.00},
            ],
        },
        "drink_package": None,
        "reservations": [],
    },

    # ── Show + dining combo — Balcony ───────────────────────────────────────
    "9999999997": {
        "guest_id": "MA-11204",
        "name": "Mr. and Mrs. O'Brien",
        "primary_first_name": "Sarah",
        "primary_last_name": "O'Brien",
        "cabin": "11204",
        "deck": 11,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Balcony",
        "mobile_number": "9999999997",
        "booking_ref": "MA-2026-11204",
        "folio": {
            "balance": 245.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-24", "desc": "Serenity Spa — Salt Stone Facial", "amount": 95.00},
                {"date": "2026-05-25", "desc": "Sunset Bar x3 — mocktails", "amount": 42.50},
                {"date": "2026-05-26", "desc": "Retail — Marenova tee", "amount": 47.00},
                {"date": "2026-05-26", "desc": "Bean & Berry — flat whites x8", "amount": 34.00},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "show",
                "show_id": "untitled-1030",
                "show_name": "Aurora Live",
                "venue": "Starlight Lounge",
                "time": "22:30",
                "time_human": "10:30 PM",
                "count": 2,
                "confirmation_id": "AL11241",
            },
            {
                "kind": "dining",
                "restaurant_id": "pink-agave",
                "restaurant_name": "Agave Coast",
                "time": "20:30",
                "time_human": "8:30 PM",
                "party_size": 2,
                "confirmation_id": "AC11242",
            },
        ],
    },

    # ── Aurora Grand Suite high-spender (The Aurora Deck) ───────────────────
    "9999999998": {
        "guest_id": "MA-33070",
        "name": "Mr. and Mrs. Tanaka",
        "primary_first_name": "Yuki",
        "primary_last_name": "Tanaka",
        "cabin": "15307",
        "deck": 15,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Aurora Grand Suite",
        "mobile_number": "9999999998",
        "booking_ref": "MA-2026-33070",
        "folio": {
            "balance": 0.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation — Aurora Grand fast-track", "amount": 0.00},
                {"date": "2026-05-24", "desc": "The Aurora Deck — refreshments (included)", "amount": 0.00},
                {"date": "2026-05-25", "desc": "The Chef's Table — 7-course pairing", "amount": 0.00},
                {"date": "2026-05-26", "desc": "Salon — Cut, color, blow-out", "amount": 0.00},
                {"date": "2026-05-26", "desc": "Serenity Spa — Hydrotherapy (unlimited)", "amount": 0.00},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "spa",
                "treatment_name": "Aurora Grand Hydrotherapy Day Pass",
                "time": "15:00",
                "time_human": "3:00 PM",
                "duration_min": 180,
                "price": 0.00,
                "confirmation_id": "AG33071",
            },
        ],
    },

    # ── Excursion focus — Balcony ───────────────────────────────────────────
    "9999999999": {
        "guest_id": "MA-85010",
        "name": "Mr. and Mrs. Osei",
        "primary_first_name": "Aisha",
        "primary_last_name": "Osei",
        "cabin": "8501",
        "deck": 8,
        "party_size": 2,
        "language_preference": "en",
        "vifp_tier": "Balcony",
        "mobile_number": "9999999999",
        "booking_ref": "MA-2026-85010",
        "folio": {
            "balance": 158.00,
            "items": [
                {"date": "2026-05-23", "desc": "Embarkation Photo", "amount": 24.95},
                {"date": "2026-05-24", "desc": "Aurora Cay Beach Day — smoothie rounds", "amount": 38.50},
                {"date": "2026-05-25", "desc": "Bean & Berry — flat whites x3", "amount": 14.55},
                {"date": "2026-05-26", "desc": "Sunset Bar — tropical mocktail flight", "amount": 24.00},
                {"date": "2026-05-26", "desc": "Excursion — Puerto Plata Chocolate x2", "amount": 56.00},
            ],
        },
        "drink_package": None,
        "reservations": [
            {
                "kind": "dining",
                "restaurant_id": "gunbae",
                "restaurant_name": "Seoul Table",
                "time": "19:00",
                "time_human": "7:00 PM",
                "party_size": 2,
                "confirmation_id": "ST85011",
            },
        ],
    },
}
