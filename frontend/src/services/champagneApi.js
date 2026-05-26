// Virgin signature ritual — Shake for Champagne.
// Direct backend endpoint (no agent chat) for the dashboard button/shake action.
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function orderChampagne({ location = "" } = {}) {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/champagne/order`,
    { location },
    { headers: { "Content-Type": "application/json" } },
  );
  return data;
}
