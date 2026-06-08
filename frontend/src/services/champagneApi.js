// Marenova signature experience — Shake for a Treat.
// Direct backend endpoint (no agent chat) for the dashboard button/shake action.
// (Endpoint path /api/champagne/order kept stable so the client is unchanged.)
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
