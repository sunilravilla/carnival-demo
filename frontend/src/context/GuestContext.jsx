import { createContext, useContext, useState, useCallback, useRef } from "react";
import { getReservations, getFolio, storeGuestPhone, clearStoredGuest, resetGuest } from "../services/api";

const GuestContext = createContext(null);

export function GuestProvider({ children }) {
  const [guestData, setGuestData] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [folio, setFolio] = useState({ balance: 0, items: [] });
  const [drinkPackage, setDrinkPackage] = useState(null);
  const [marinaUnread, setMarinaUnread] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(true);
  const clearChatRef = useRef(null); // ChatInterface exposes clearConversation via this ref

  const loadGuest = useCallback((fullGuestData) => {
    const { cruise, ship, folio: f, reservations: r, drink_package, ...identity } = fullGuestData;
    // Normalize snake_case → camelCase for display fields
    const normalized = {
      ...identity,
      cruise,
      ship,
      primaryFirstName: identity.primary_first_name || identity.primaryFirstName,
      primaryLastName: identity.primary_last_name || identity.primaryLastName,
      vifpTier: identity.vifp_tier || identity.vifpTier,
      partySize: identity.party_size || identity.partySize,
      guestId: identity.guest_id || identity.guestId,
    };
    setGuestData(normalized);
    setReservations(r || []);
    setFolio(f || { balance: 0, items: [] });
    setDrinkPackage(drink_package || null);
    setMarinaUnread(false);
    storeGuestPhone(identity.mobile_number || identity.guestId);
  }, []);

  const refreshReservations = useCallback(async () => {
    try {
      const data = await getReservations();
      setReservations(data.reservations || []);
    } catch (e) {
      console.warn("refreshReservations failed:", e);
    }
  }, []);

  const refreshFolio = useCallback(async () => {
    try {
      const data = await getFolio();
      setFolio(data);
    } catch (e) {
      console.warn("refreshFolio failed:", e);
    }
  }, []);

  const applyAgentUpdate = useCallback((event) => {
    const { card_payload, folio_balance } = event || {};

    if (folio_balance != null) {
      setFolio((prev) => ({ ...prev, balance: folio_balance }));
    }

    const cards = Array.isArray(card_payload) ? card_payload : [card_payload];
    const bookingCards = ["dining", "show", "spa_booking", "drink_package"];
    const cancelCards = ["cancel"];
    const folioCards = ["folio", "drink_package"];

    const hasBooking = cards.some((c) => bookingCards.includes(c?.card));
    const hasCancel = cards.some((c) => cancelCards.includes(c?.card));
    const hasFolioUpdate = folio_balance != null || cards.some((c) => folioCards.includes(c?.card));

    if (hasBooking || hasCancel) {
      refreshReservations();
    }
    if (hasFolioUpdate) {
      refreshFolio();
    }
    if (hasBooking) {
      setMarinaUnread(true);
    }
  }, [refreshReservations, refreshFolio]);

  const clearGuest = useCallback(async () => {
    // Reset backend session state
    const phone = guestData?.mobile_number;
    if (phone) {
      try { await resetGuest(phone); } catch (_) {}
    }
    // Clear chat history
    if (clearChatRef.current) {
      clearChatRef.current();
    }
    // Clear frontend state
    clearStoredGuest();
    setGuestData(null);
    setReservations([]);
    setFolio({ balance: 0, items: [] });
    setDrinkPackage(null);
    setMarinaUnread(false);
    setIsFirstVisit(true);
  }, [guestData]);

  const value = {
    // Identity
    guestData,
    reservations,
    folio,
    drinkPackage,
    marinaUnread,
    isFirstVisit,
    // Actions
    loadGuest,
    refreshReservations,
    refreshFolio,
    applyAgentUpdate,
    setMarinaUnread,
    setIsFirstVisit,
    clearGuest,
    clearChatRef, // ChatInterface sets clearChatRef.current = clearConversation
  };

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

export function useGuest() {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error("useGuest must be used inside GuestProvider");
  return ctx;
}

export default GuestContext;
