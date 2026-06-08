// Generative-UI cards rendered above the conversation when the agent calls a tool.
// Single file holds all variants to keep the demo footprint compact.
import { useState } from "react";
import { activeTheme as theme, branding } from "../../styles/branding";

// Inject card-slide-up keyframe once
if (!document.getElementById("concierge-card-keyframes")) {
  const s = document.createElement("style");
  s.id = "concierge-card-keyframes";
  s.textContent = `
    @keyframes card-slide-up {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(s);
}

function downloadICS({ title, date, startHHMM, durationMin = 90, location = "", description = "" }) {
  // Parse date + time into YYYYMMDDTHHMMSS (floating local time — no TZ suffix)
  const [year, month, day] = (date || "2026-05-06").split("-");
  const [startH, startM] = (startHHMM || "19:00").split(":");
  const pad = (n) => String(n).padStart(2, "0");
  const dtStart = `${year}${month}${day}T${pad(startH)}${pad(startM)}00`;
  const endMin = parseInt(startM, 10) + durationMin;
  const endH = parseInt(startH, 10) + Math.floor(endMin / 60);
  const dtEnd = `${year}${month}${day}T${pad(endH)}${pad(endMin % 60)}00`;
  const uid = `${(branding.avatarName || 'concierge').toLowerCase()}-${Date.now()}@${(branding.logoText || 'cruise').toLowerCase().replace(/\s+/g, '-')}.demo`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${branding.avatarName || 'Concierge'}//${branding.logoText || 'Cruise'}//EN`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description.replace(/\n/g, "\\n")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "-")}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const cardBase = {
  background: "white",
  borderRadius: theme.borderRadius.md,
  boxShadow: theme.elevation.medium,
  padding: theme.spacing.lg,
  marginBottom: theme.spacing.md,
  border: `1px solid ${theme.border.weak}`,
  fontSize: theme.typography.fontSizes.md,
  color: theme.text.strong,
  animation: "card-slide-up 0.35s ease",
};
const headerStrip = (color) => ({
  height: 5,
  borderRadius: 2,
  background: color,
  borderBottom: `1px solid ${theme.brand.blue || "#014E8F"}`,
  marginBottom: theme.spacing.md,
});
const row = { display: "flex", justifyContent: "space-between", gap: theme.spacing.md, alignItems: "baseline", flexWrap: "wrap" };
const subtle = { color: theme.text.weak, fontSize: theme.typography.fontSizes.sm };
const title = { fontWeight: theme.typography.fontWeights.bold, fontSize: theme.typography.fontSizes.lg, color: theme.text.strong, margin: 0 };
const pill = (bg, fg) => ({ display: "inline-block", padding: "4px 10px", borderRadius: 999, background: bg, color: fg, fontSize: theme.typography.fontSizes.xs, fontWeight: theme.typography.fontWeights.bold });
const btn = {
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  borderRadius: theme.borderRadius.sm,
  border: "none",
  background: theme.brand.green,
  color: "white",
  fontWeight: theme.typography.fontWeights.bold,
  cursor: "pointer",
  fontSize: theme.typography.fontSizes.sm,
  minHeight: "44px",
  minWidth: "120px",
};

function TodayCard({ payload }) {
  return (
    <div style={cardBase}>
      <div style={headerStrip(theme.gradients.primary)} />
      <div style={row}>
        <h3 style={title}>Today on {payload.ship}</h3>
        <span style={pill(theme.brand.sun || "#FFC72C", "#222")}>{payload.day_label}</span>
      </div>
      <p style={{ ...subtle, marginTop: theme.spacing.xs }}>
        Next port: <strong>{payload.next_port?.name}</strong>
        {payload.next_port?.all_aboard_time ? ` · all aboard ${payload.next_port.all_aboard_time}` : ""}
      </p>
      <div style={{ marginTop: theme.spacing.md, display: "flex", flexDirection: "column", gap: theme.spacing.sm }}>
        {(payload.highlights || []).map((h, i) => (
          <div key={i} style={{ ...row, paddingBottom: theme.spacing.sm, borderBottom: `1px dashed ${theme.border.weak}` }}>
            <div>
              <div style={{ fontWeight: theme.typography.fontWeights.bold }}>{h.title}</div>
              <div style={subtle}>{h.venue}</div>
            </div>
            <div style={{ fontVariantNumeric: "tabular-nums", color: theme.brand.green }}>{h.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiningCard({ payload }) {
  const r = payload.restaurant || {};
  const isModified = !!payload.modified;
  return (
    <div style={cardBase}>
      <div style={headerStrip(isModified ? "#D97706" : theme.brand.green)} />
      <div style={row}>
        <h3 style={title}>{r.name}</h3>
        <span style={pill(isModified ? "#F59E0B" : theme.brand.green, "white")}>
          {isModified ? "Modified ✓" : "Confirmed"} · #{payload.confirmation_id}
        </span>
      </div>
      <p style={subtle}>{r.cuisine} · {r.location}{r.cover_charge ? ` · cover $${r.cover_charge.toFixed(2)}` : " · no cover"}</p>
      {r.headline_dish && <p style={{ marginTop: theme.spacing.sm, fontStyle: "italic", color: theme.text.main }}>"{r.headline_dish}"</p>}
      <div style={{ ...row, marginTop: theme.spacing.md }}>
        <div>
          <div style={subtle}>Time</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold, fontSize: theme.typography.fontSizes.lg }}>{payload.time_human}</div>
          {isModified && payload.old_time_human && (
            <div style={{ fontSize: 11, color: "#9CA3AF", textDecoration: "line-through", marginTop: 2 }}>{payload.old_time_human}</div>
          )}
        </div>
        <div>
          <div style={subtle}>Party</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold, fontSize: theme.typography.fontSizes.lg }}>{payload.party_size}</div>
        </div>
        <button style={btn} onClick={() => downloadICS({
          title: r.name,
          date: payload.date,
          startHHMM: payload.time,
          durationMin: 90,
          location: `${r.location}, ${branding.logoText || ''}`,
          description: `Reservation #${payload.confirmation_id} · Party of ${payload.party_size}${r.cover_charge ? ` · Cover charge $${r.cover_charge.toFixed(2)}/person` : ""}`,
        })}>Add to Calendar</button>
      </div>
    </div>
  );
}

function ShowCard({ payload }) {
  const s = payload.show || {};
  return (
    <div style={cardBase}>
      <div style={headerStrip(theme.brand.blue || "#014E8F")} />
      <div style={row}>
        <h3 style={title}>{s.name}</h3>
        <span style={pill(theme.brand.blue || "#014E8F", "white")}>Tickets · #{payload.confirmation_id}</span>
      </div>
      <p style={subtle}>{s.venue} · {s.headliner} · {s.rating} · {s.duration_min} min</p>
      <div style={{ ...row, marginTop: theme.spacing.md }}>
        <div>
          <div style={subtle}>Showtime</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold, fontSize: theme.typography.fontSizes.lg }}>{payload.time_human}</div>
        </div>
        <div>
          <div style={subtle}>Seats</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold }}>{payload.seat_label}</div>
        </div>
        <button style={btn} onClick={() => downloadICS({
          title: s.name,
          date: payload.date,
          startHHMM: payload.time,
          durationMin: s.duration_min || 60,
          location: `${s.venue}, ${branding.logoText || ''}`,
          description: `${payload.seat_label} · Confirmation #${payload.confirmation_id}${s.headliner ? ` · Featuring ${s.headliner}` : ""}`,
        })}>Save to Calendar</button>
      </div>
    </div>
  );
}

function ExcursionCard({ payload }) {
  const e = payload.excursion || {};
  return (
    <div style={cardBase}>
      <div style={headerStrip(theme.gradients.sunset || theme.gradients.primary)} />
      <div style={row}>
        <h3 style={title}>{e.name}</h3>
        <span style={pill(theme.brand.sun || "#FFC72C", "#222")}>{e.port}</span>
      </div>
      <p style={subtle}>{e.date} · {e.duration_min} min · {e.rating}{e.min_age ? ` · age ${e.min_age}+` : ""}</p>
      <div style={{ ...row, marginTop: theme.spacing.md }}>
        <div>
          <div style={subtle}>Meet</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold, fontSize: theme.typography.fontSizes.lg }}>{payload.time_human}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={subtle}>Location</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold }}>{e.meet_location}</div>
          <div style={subtle}>{e.deck_directions}</div>
        </div>
      </div>
      {payload.scanned_thumbnail_url && (
        <div style={{ marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTop: `1px dashed ${theme.border.weak}` }}>
          <div style={subtle}>Scanned ticket</div>
          <img src={payload.scanned_thumbnail_url} alt="scanned" style={{ maxWidth: 120, borderRadius: 4, marginTop: 6 }} />
        </div>
      )}
      {payload.translated_caption && (
        <p style={{ marginTop: theme.spacing.sm, padding: theme.spacing.sm, background: theme.background.back, borderRadius: 4, fontStyle: "italic" }}>
          {payload.translated_caption}
        </p>
      )}
      <div style={{ marginTop: theme.spacing.md }}>
        <button style={btn} onClick={() => downloadICS({
          title: e.name,
          date: e.date,
          startHHMM: e.meet_time,
          durationMin: e.duration_min || 210,
          location: `${e.meet_location}, ${e.port}`,
          description: `${e.port} shore excursion · $${e.price_per_guest}/person · All aboard 16:30`,
        })}>Save to Calendar</button>
      </div>
    </div>
  );
}

function FolioCard({ payload }) {
  const items = (payload.items || []).slice(-6);
  return (
    <div style={cardBase}>
      <div style={headerStrip(theme.brand.green)} />
      <div style={row}>
        <h3 style={title}>Folio · Cabin {payload.cabin}</h3>
        <span style={pill(theme.text.strong, "white")}>${payload.balance.toFixed(2)}</span>
      </div>
      <p style={subtle}>{payload.guest_name}</p>
      <div style={{ marginTop: theme.spacing.md, display: "flex", flexDirection: "column" }}>
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              ...row,
              fontSize: theme.typography.fontSizes.sm,
              paddingBottom: 6,
              paddingTop: i === 0 ? 0 : 6,
              borderBottom: i === items.length - 1 ? "none" : `1px dashed ${theme.border.weak}`,
            }}
          >
            <span style={{ color: theme.text.main }}>
              <span style={{ color: theme.text.weak, marginRight: 6 }}>{it.date}</span>
              {it.desc}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, textAlign: "right", minWidth: 70 }}>
              ${it.amount.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrinkPackageCard({ payload }) {
  const p = payload.package || {};
  // Wave-4 fix (Bug E): backend now returns charged_to_folio + credit_loaded +
  // new_folio_balance for an actual debit picture. Fall back to legacy fields
  // for any test fixtures that haven't been refreshed yet.
  const charged = (typeof payload.charged_to_folio === "number")
    ? payload.charged_to_folio
    : (payload.total ?? 0);
  const credit = (typeof payload.credit_loaded === "number")
    ? payload.credit_loaded
    : (p.credit_value ?? 0);
  const newBal = (typeof payload.new_folio_balance === "number")
    ? payload.new_folio_balance
    : (payload.new_balance ?? 0);
  return (
    <div style={cardBase}>
      <div style={headerStrip(theme.brand.sun || "#FFC72C")} />
      <div style={row}>
        <h3 style={title}>{p.name}</h3>
        <span style={pill(theme.brand.green, "white")}>Active · {payload.days} days</span>
      </div>
      <p style={subtle}>{p.covers}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: theme.spacing.md }}>
        <div>
          <div style={subtle}>Charged</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold, fontSize: theme.typography.fontSizes.lg }}>${charged.toFixed(2)}</div>
        </div>
        <div>
          <div style={subtle}>Credit loaded</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold, fontSize: theme.typography.fontSizes.lg, color: theme.brand?.green || "#2D7D5F" }}>${credit.toFixed(2)}</div>
        </div>
        <div>
          <div style={subtle}>New folio</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold, fontSize: theme.typography.fontSizes.lg }}>${newBal.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Marenova: Drink-package picker option (one of two side-by-side cards) ────
// Returned by `recommend_drink_packages` when the guest says generic
// "upgrade my drink package" — they tap a card's button to lock in a tier.
function DrinkPackageOptionCard({ payload, onAction }) {
  const red = "#CC0000";
  const tolopea = "#2E0444";
  const p = payload.package || {};
  const price = payload.one_time_price ?? 0;
  const credit = payload.credit_value ?? 0;
  const bonus = price > 0 ? Math.round(((credit - price) / price) * 100) : 0;
  const prompt = payload.suggested_action || `Give me the $${price} package`;
  return (
    <div style={{ ...cardBase, borderColor: "#F0D8D8", overflow: "hidden", padding: 0 }}>
      <div style={{
        padding: "12px 16px",
        background: `linear-gradient(135deg, ${tolopea} 0%, ${red} 100%)`,
        color: "#fff",
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", opacity: 0.9 }}>
          Refreshment Package
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2, marginTop: 4 }}>
          ${price.toFixed(0)} → ${credit.toFixed(0)} of credit
        </div>
        {bonus > 0 && (
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>+{bonus}% bonus credit</div>
        )}
      </div>
      <div style={{ padding: "12px 16px" }}>
        <p style={{ ...subtle, margin: 0 }}>{p.covers}</p>
      </div>
      <div style={{ padding: "0 16px 14px" }}>
        <button
          type="button"
          onClick={() => onAction && onAction(prompt)}
          style={{
            width: "100%",
            padding: "10px 14px",
            border: "none",
            borderRadius: 10,
            background: red,
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Lock it in
        </button>
      </div>
    </div>
  );
}

const KIND_ICON = { dining: "🍽️", show: "🎭", spa: "💆", other: "📋" };

function ReservationsCard({ payload, onAction }) {
  const [confirmIdx, setConfirmIdx] = useState(null);
  const reservations = payload.reservations || [];

  return (
    <div style={{ ...cardBase, borderColor: "#014E8F" }}>
      <div style={headerStrip("#014E8F")} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={title}>My Reservations</h3>
        <span style={pill("#E8F0FB", "#014E8F")}>{reservations.length} active</span>
      </div>

      {reservations.length === 0 ? (
        <p style={{ ...subtle, textAlign: "center", padding: "12px 0" }}>No reservations booked yet this session.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reservations.map((r, i) => (
            <div key={i} style={{
              border: `1px solid ${theme.border?.weak || "#e5e0d8"}`,
              borderRadius: 10, padding: "10px 12px",
              background: confirmIdx === i ? "#FFF5F5" : "#FAFAFA",
            }}>
              {confirmIdx === i ? (
                <div>
                  <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: 14, color: "#B61B38" }}>
                    Cancel {r.name}?
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => { onAction?.({ type: "cancel", name: r.name }); setConfirmIdx(null); }}
                      style={{ flex: 1, padding: "8px 0", background: "#B61B38", color: "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >Yes, Cancel</button>
                    <button
                      onClick={() => setConfirmIdx(null)}
                      style={{ flex: 1, padding: "8px 0", background: "white", color: "#014E8F", border: "1px solid #014E8F", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >Keep It</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{KIND_ICON[r.kind] || KIND_ICON.other}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                    <div style={{ ...subtle, fontSize: 12 }}>
                      {r.time_human && `${r.time_human} · `}#{r.confirmation_id}
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmIdx(i)}
                    style={{ padding: "5px 12px", background: "white", color: "#B61B38", border: "1px solid #B61B38", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpaBookingCard({ payload }) {
  const teal = "#0A7B6C";
  return (
    <div style={{ ...cardBase, borderColor: "#B2DFDB" }}>
      <div style={headerStrip(teal)} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <h3 style={{ ...title, color: teal }}>💆 {payload.treatment}</h3>
        <span style={pill("#E0F2F1", teal)}>#{payload.confirmation_id}</span>
      </div>
      <div style={{ ...subtle, marginBottom: 12 }}>
        {payload.location} · {payload.duration_min < 120 ? `${payload.duration_min} min` : "All day"}
      </div>
      <div style={{ ...row, marginBottom: 12 }}>
        <div>
          <div style={subtle}>Appointment</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{payload.time_human}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={subtle}>Total</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: teal }}>${payload.discounted_price.toFixed(2)}</div>
          {payload.savings > 0 && (
            <div style={{ fontSize: 11, color: teal }}>
              <s style={{ color: "#999" }}>${payload.original_price}</s> · Saved ${payload.savings.toFixed(2)}
            </div>
          )}
        </div>
      </div>
      {payload.vifp_note && (
        <div style={{ ...pill("#E0F2F1", teal), display: "block", textAlign: "center", padding: "6px 12px", borderRadius: 8 }}>
          ✓ {payload.vifp_note}
        </div>
      )}
    </div>
  );
}

function CancelCard({ payload }) {
  return (
    <div style={{ ...cardBase, borderColor: "#a8d5b5" }}>
      <div style={headerStrip("#2E7D52")} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: theme.spacing.md }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "#E8F5EE", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E7D52" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ ...title, color: "#2E7D52", marginBottom: 6 }}>Reservation Cancelled</h3>
          <div style={row}>
            <span style={{ fontWeight: 600 }}>{payload.name}</span>
            {payload.time_human && <span style={subtle}>{payload.time_human}</span>}
          </div>
          {payload.confirmation_id && (
            <div style={{ ...subtle, marginTop: 4 }}>Ref: {payload.confirmation_id}</div>
          )}
        </div>
      </div>
    </div>
  );
}

const WEATHER_ICONS = { sunny: "☀️", partly_cloudy: "⛅", cloudy: "☁️", rainy: "🌧️" };

function WeatherCard({ payload }) {
  // Wave 5: use port_today (current dynamic name) but fall back to legacy
  // 'cozumel' key for older fixtures. Attribution + port label now driven by
  // the brand registry and the backend, not hardcoded Carnival strings.
  const port = payload.port_today || payload.cozumel || {};
  const onboard = payload.onboard || {};
  const portTodayName = payload.port_today_name || payload.location || "Today's port";
  const showSnorkelTip = (port.icon_key === "sunny" || port.icon_key === "partly_cloudy") && (port.uv_index || 0) >= 6;
  const uvLabel = (uv) => uv >= 8 ? "Very High" : uv >= 6 ? "High" : uv >= 3 ? "Moderate" : "Low";

  return (
    <div data-testid="weather-card" style={{ ...cardBase, borderColor: "#0EA5E9", padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0EA5E9 0%, #0D9488 100%)",
        padding: "12px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🌤</span>
          <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>Weather Update</span>
        </div>
        <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>{branding.avatarName} ✦</span>
      </div>

      {/* Two-column weather */}
      <div style={{ display: "flex", gap: 0 }}>
        {/* Left: Onboard */}
        <div style={{ flex: 1, padding: "14px 16px", borderRight: "1px solid #E0F2FE" }}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Onboard Now</div>
          <div style={{ fontSize: 32 }}>{WEATHER_ICONS[onboard.icon_key] || "⛅"}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#1E293B", lineHeight: 1.1 }}>{onboard.temp_f}°F</div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{onboard.condition}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>Seas: {onboard.sea_state}</div>
        </div>

        {/* Right: Today's port (live) */}
        <div style={{ flex: 1, padding: "14px 16px", background: "#F0FDF4" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{portTodayName} · Today</div>
            {payload.live && (
              <span style={{ background: "#F59E0B", color: "white", fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 999 }}>LIVE</span>
            )}
          </div>
          <div style={{ fontSize: 32 }}>{WEATHER_ICONS[port.icon_key] || "☀️"}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#1E293B", lineHeight: 1.1 }}>{port.temp_f}°F</div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{port.condition}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>
            {port.wind_mph && `Wind: ${port.wind_mph} mph`}
            {port.uv_index != null && ` · UV: ${uvLabel(port.uv_index)} (${port.uv_index})`}
          </div>
          {port.humidity != null && (
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>Humidity: {port.humidity}%</div>
          )}
        </div>
      </div>

      {/* Snorkel tip */}
      {showSnorkelTip && (
        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid #E0F2FE",
          background: "#F0FDFA",
          fontSize: 13, color: "#0F766E",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          🤿 <span>Perfect snorkeling visibility — excellent conditions for the reef excursion.</span>
        </div>
      )}
    </div>
  );
}

function ErrorCard({ payload }) {
  return (
    <div style={{ ...cardBase, borderColor: "#e0a0a0" }}>
      <div style={headerStrip("#B61B38")} />
      <h3 style={title}>I couldn't quite get that</h3>
      <p style={{ marginTop: theme.spacing.sm }}>{payload.error}</p>
    </div>
  );
}

// ── Marenova: Shake for a Treat confirmation card ───────────────────────────
function ChampagneCard({ payload }) {
  const red = "#18A0A8";
  return (
    <div style={{ ...cardBase, borderColor: "#B8E6E8" }}>
      <div style={headerStrip(red)} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <h3 style={{ ...title, color: red }}>🍦 {payload.bottle}</h3>
        <span style={pill("#E6F6F7", red)}>#{payload.confirmation_id}</span>
      </div>
      <div style={{ ...subtle, marginBottom: 10 }}>
        From {payload.dispatched_from}
      </div>
      <div style={{ ...row, marginBottom: 10 }}>
        <div>
          <div style={subtle}>Delivery to</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{payload.location}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          {payload.scheduled_for ? (
            <>
              <div style={subtle}>Pre-poured at</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: red }}>{payload.scheduled_for}</div>
            </>
          ) : (
            <>
              <div style={subtle}>ETA</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: red }}>~{payload.eta_minutes} min</div>
            </>
          )}
        </div>
      </div>
      <div style={{ ...pill("#E6F6F7", red), display: "block", textAlign: "center", padding: "6px 12px", borderRadius: 8 }}>
        {(payload.price || 0) > 0 ? `$${payload.price.toFixed(2)} · ` : "Complimentary · "}delivered with a smile
      </div>
    </div>
  );
}

// ── Marenova: Tonight's Look — outfit suggestions ─────────────────────────────
function OutfitSuggestionCard({ payload, onAction }) {
  const red = "#CC0000";
  const looks = payload.looks || [];
  return (
    <div style={{ ...cardBase, borderColor: "#F0D8D8" }}>
      <div style={headerStrip(red)} />
      <h3 style={{ ...title, color: red, marginBottom: 4 }}>
        💃 Tonight's Look — {String(payload.occasion || "").replace(/\b\w/g, c => c.toUpperCase())}
      </h3>
      {payload.stylist_note && (
        <div style={{ ...subtle, marginBottom: 12 }}>{payload.stylist_note}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        {looks.map((look) => (
          <div key={look.id} style={{
            display: "flex", gap: 10, padding: 10,
            background: "#FAFAF7", borderRadius: 10,
            border: "1px solid #ECE8E0",
          }}>
            <img
              src={look.image}
              alt={look.name}
              style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", background: "#fff", flexShrink: 0 }}
              onError={(e) => { e.target.style.visibility = "hidden"; }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#0A0A0A" }}>{look.name}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{look.description}</div>
              <div style={{ fontSize: 11, color: red, marginTop: 4, fontStyle: "italic" }}>{look.vibe}</div>
              {onAction && (
                <button
                  onClick={() => onAction(`I want ${look.name} — book the salon and a Starlight Lounge table to land it`)}
                  style={{
                    marginTop: 8,
                    background: red, color: "#fff", border: "none",
                    borderRadius: 999, padding: "6px 12px",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Land this look
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Marenova: Salon booking confirmation ──────────────────────────────────────
function SalonBookingCard({ payload }) {
  const gold = "#D4A862";
  return (
    <div style={{ ...cardBase, borderColor: "#E7D8B8" }}>
      <div style={headerStrip(gold)} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <h3 style={{ ...title, color: "#0A0A0A" }}>💅 {payload.service}</h3>
        <span style={pill("#F5EBD2", "#7A5A1B")}>#{payload.confirmation_id}</span>
      </div>
      <div style={{ ...subtle, marginBottom: 10 }}>
        {payload.location} · {payload.duration_min} min
      </div>
      <div style={{ ...row }}>
        <div>
          <div style={subtle}>Appointment</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{payload.time_human}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={subtle}>Total</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#0A0A0A" }}>${(payload.price || 0).toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Marenova: outfit confirmation card (from land_the_look macro) ────────────
function OutfitConfirmedCard({ payload }) {
  const red = "#CC0000";
  const tolopea = "#2E0444";
  return (
    <div style={{ ...cardBase, borderColor: "#F0D8D8", overflow: "hidden", padding: 0 }}>
      <div style={headerStrip(red)} />
      <div style={{
        display: "flex", gap: 12, padding: 14, alignItems: "center",
        background: `linear-gradient(135deg, ${tolopea}10 0%, ${red}15 100%)`,
      }}>
        <img
          src={payload.image}
          alt={payload.look_name}
          style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", background: "#fff", flexShrink: 0 }}
          onError={(e) => { e.target.style.visibility = "hidden"; }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...pill(`${red}1A`, red), marginBottom: 6 }}>✨ {payload.occasion || "Tonight"}</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#0A0A0A", lineHeight: 1.15 }}>
            {payload.look_name}
          </div>
          <div style={{ ...subtle, marginTop: 4, lineHeight: 1.35 }}>{payload.summary}</div>
        </div>
      </div>
      {payload.vibe && (
        <div style={{ padding: "10px 14px", fontSize: 12, fontStyle: "italic", color: red, borderTop: "1px solid #F2EEE7" }}>
          {payload.vibe}
        </div>
      )}
      {payload.confirmation_id && (
        <div style={{ padding: "6px 14px 12px", fontSize: 11, color: "#888", fontFamily: "ui-monospace, monospace" }}>
          Look saved · #{payload.confirmation_id}
        </div>
      )}
    </div>
  );
}

// ── Marenova: Manor table reservation card (from land_the_look macro) ─────────
function ManorTableCard({ payload }) {
  const ink = "#0A0A0A";
  const red = "#CC0000";
  const gold = "#D4A862";
  return (
    <div style={{ ...cardBase, borderColor: "#1A1A1A33", background: ink, color: "#fff" }}>
      <div style={{ ...headerStrip(red), marginLeft: 0 - 16, marginRight: 0 - 16 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <h3 style={{ ...title, color: gold, marginBottom: 0 }}>🎶 Starlight Lounge — Reserved</h3>
        <span style={pill(`${gold}26`, gold)}>#{payload.confirmation_id}</span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
        Deck {payload.deck || 6} · under a ceiling of stars
      </div>
      <div style={{ ...row }}>
        <div>
          <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>Table for</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{payload.party_size || 2}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>Tonight</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: gold }}>{payload.time_human}</div>
        </div>
      </div>
      {payload.note && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>{payload.note}</div>
      )}
    </div>
  );
}

// ── Marenova: Recovery Menu (Hangover Saver) ──────────────────────────────────
function RecoveryMenuCard({ payload }) {
  const red = "#CC0000";
  const tolopea = "#2E0444";
  const gold = "#D4A862";
  const items = payload.items || [];
  return (
    <div data-testid="recovery-menu-card" data-subset={payload.subset ? "true" : "false"} style={{ ...cardBase, borderColor: "#E7D8B8", padding: 0, overflow: "hidden" }}>
      <div style={{
        padding: "14px 16px",
        background: `linear-gradient(135deg, ${tolopea} 0%, ${red} 100%)`,
        color: "#fff",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: gold, textTransform: "uppercase", marginBottom: 4 }}>
          Morning reset
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{payload.title || "Late one, honey?"}</div>
        {payload.subtitle && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>{payload.subtitle}</div>}
      </div>
      <div>
        {items.map((it, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 16px",
            borderTop: i === 0 ? "none" : "1px solid #F2EEE7",
          }}>
            <div style={{ fontSize: 22, width: 28, textAlign: "center", flexShrink: 0 }}>{it.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.25 }}>{it.title}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{it.detail}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: "#888" }}>{it.time}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: red }}>
                {it.price === 0 ? "Included" : `$${(it.price || 0).toFixed(0)}`}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "8px 16px 12px", borderTop: "1px solid #F2EEE7", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#888" }}>
        <span>Conf #{payload.confirmation_id}</span>
        <span>Spa + lounger to folio · breakfast included</span>
      </div>
    </div>
  );
}

// ── Marenova: Manor Shazam — Now Playing track card ───────────────────────────
function NowPlayingTrackCard({ payload }) {
  const red = "#CC0000";
  const ink = "#0A0A0A";
  const gold = "#D4A862";
  return (
    <div style={{ ...cardBase, borderColor: "#1A1A1A33", background: ink, color: "#fff", padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: gold, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: red, boxShadow: `0 0 6px ${red}`, display: "inline-block" }} />
          Now · {payload.venue || "Starlight Lounge"} · Deck {payload.deck || 6}
        </div>
        {payload.year && <div style={{ fontSize: 11, color: gold }}>{payload.year}</div>}
      </div>
      <div style={{ padding: "0 16px 8px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>🎧 {payload.track}</div>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 3 }}>{payload.artist}{payload.vibe ? ` · ${payload.vibe}` : ""}</div>
        {(payload.set_label || payload.dj) && (
          <div style={{
            marginTop: 8,
            fontSize: 11,
            color: gold,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}>
            {payload.dj && <span>{payload.dj}</span>}
            {payload.set_label && <span style={{ opacity: 0.7 }}>·</span>}
            {payload.set_label && <span>{payload.set_label}</span>}
            {payload.set_until && <span style={{ opacity: 0.7, fontWeight: 500, textTransform: "none", letterSpacing: 0.4 }}>until {payload.set_until}</span>}
          </div>
        )}
        {payload.set_vibe && (
          <div style={{ fontSize: 12, fontStyle: "italic", opacity: 0.75, marginTop: 4 }}>{payload.set_vibe}</div>
        )}
      </div>
      {payload.trivia && (
        <div style={{ padding: "10px 16px", fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.85)", borderTop: "1px solid rgba(255,255,255,0.10)" }}>
          {payload.trivia}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px 14px", borderTop: "1px solid rgba(255,255,255,0.10)" }}>
        {payload.added_to_playlist && (
          <span style={pill(`${gold}26`, gold)}>✓ Saved to {payload.playlist_name || "Cruise Soundtrack"}</span>
        )}
        {payload.spotify_search_url && (
          <a
            href={payload.spotify_search_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...pill(`${red}30`, "#fff"),
              textDecoration: "none",
              border: `1px solid ${red}66`,
              cursor: "pointer",
            }}
          >
            Open in Spotify ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ── Marenova: Surprise Mode — headline coordination card ────────────────────
function SurpriseSummaryCard({ payload }) {
  const red = "#18A0A8";
  const tolopea = "#0B3D5C";
  const gold = "#E8B04B";
  const rows = [
    { icon: "💐", label: "Flowers", value: `${payload.flowers?.item} · to ${payload.flowers?.location}` },
    { icon: "🍽", label: "Table", value: `${payload.restaurant} · ${payload.dinner_time_human}` },
    { icon: "🥂", label: "Toast", value: payload.champagne },
    { icon: "🍰", label: "Dessert", value: payload.dessert },
  ].filter(r => r.value);
  return (
    <div style={{ ...cardBase, borderColor: "#F0D8D8", padding: 0, overflow: "hidden" }}>
      <div style={{
        padding: "14px 16px",
        background: `linear-gradient(135deg, ${tolopea} 0%, ${red} 100%)`,
        color: "#fff",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: gold, textTransform: "uppercase", marginBottom: 4 }}>
          🎁 {payload.occasion || "Surprise"} for {payload.recipient}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{payload.headline}</div>
      </div>
      <div>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 16px",
            borderTop: i === 0 ? "none" : "1px solid #F2EEE7",
          }}>
            <div style={{ fontSize: 20, width: 28, textAlign: "center", flexShrink: 0 }}>{r.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>{r.label}</div>
              <div style={{ fontSize: 13, color: "#0A0A0A", lineHeight: 1.3, marginTop: 2 }}>{r.value}</div>
            </div>
          </div>
        ))}
      </div>
      {payload.extras && (
        <div style={{ padding: "10px 16px", borderTop: "1px solid #F2EEE7", fontSize: 12, fontStyle: "italic", color: red }}>
          ✨ {payload.extras}
        </div>
      )}
      <div style={{ padding: "8px 16px 12px", fontSize: 11, color: "#888", fontFamily: "ui-monospace, monospace" }}>
        #{payload.confirmation_id}
      </div>
    </div>
  );
}

// ── Marenova: Pre-Board Bimini — port day plan ───────────────────────────────
function PortDayPlanCard({ payload }) {
  const viking = "#6DBDD6";
  const tolopea = "#2E0444";
  const gold = "#D4A862";
  const agenda = payload.agenda || [];
  return (
    <div style={{ ...cardBase, borderColor: "#B8D8E0", padding: 0, overflow: "hidden" }}>
      <div style={{
        padding: "14px 16px",
        background: `linear-gradient(135deg, ${tolopea} 0%, ${viking} 100%)`,
        color: "#fff",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: gold, textTransform: "uppercase", marginBottom: 4 }}>
          🏝 Tomorrow · {payload.port}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>Pre-staged for {payload.party_size}</div>
        {payload.weather && (
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
            ☀️ {payload.weather.temp_f}°F · {payload.weather.condition} · UV {payload.weather.uv} · Seas: {payload.weather.sea_state}
          </div>
        )}
      </div>
      <div style={{ padding: "8px 0" }}>
        {agenda.map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "8px 16px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: tolopea, width: 56, fontFamily: "ui-monospace, monospace", flexShrink: 0 }}>
              {item.time}
            </div>
            <div style={{ fontSize: 13, color: "#0A0A0A", lineHeight: 1.3 }}>{item.what}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "8px 16px 12px", borderTop: "1px solid #F2EEE7", fontSize: 11, color: "#888", fontFamily: "ui-monospace, monospace" }}>
        Plan #{payload.confirmation_id} · cabana: {payload.cabana_tier}
      </div>
    </div>
  );
}

// ── Marenova: Pack Forecaster — tailored packing list ────────────────────────
function PackingListCard({ payload }) {
  const red = "#CC0000";
  const tolopea = "#2E0444";
  const tagColor = {
    essential: { bg: `${red}1A`, fg: red, label: "ESSENTIAL" },
    recommended: { bg: `${tolopea}1A`, fg: tolopea, label: "RECOMMENDED" },
    optional: { bg: "#F2EEE7", fg: "#888", label: "OPTIONAL" },
  };
  const sections = payload.sections || [];
  return (
    <div style={{ ...cardBase, borderColor: "#E0DAD0", padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", background: tolopea, color: "#fff" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "#D4A862", textTransform: "uppercase", marginBottom: 4 }}>
          🎒 Pack Forecaster
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{payload.title}</div>
        {payload.subtitle && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>{payload.subtitle}</div>}
      </div>
      {sections.map((sec, i) => (
        <div key={i} style={{ padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #F2EEE7" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0A0A0A", marginBottom: 2 }}>{sec.title}</div>
          {sec.subtitle && <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>{sec.subtitle}</div>}
          <div>
            {(sec.items || []).map((it, j) => {
              const t = tagColor[it.tag] || tagColor.optional;
              return (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: "#0A0A0A" }}>
                  <input type="checkbox" style={{ accentColor: red, cursor: "pointer", flexShrink: 0 }} />
                  <span style={{ flex: 1, lineHeight: 1.3 }}>{it.name}</span>
                  <span style={{ ...pill(t.bg, t.fg), fontSize: 9, padding: "2px 6px", flexShrink: 0 }}>{t.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Marenova: Voyage Diary — illustrated per-day recap ───────────────────────
function VoyageDiaryCard({ payload }) {
  const red = "#CC0000";
  const tolopea = "#2E0444";
  const gold = "#D4A862";
  const moments = payload.moments || [];
  const stats = payload.stats || {};
  return (
    <div style={{ ...cardBase, borderColor: "#E7D8B8", padding: 0, overflow: "hidden" }}>
      {payload.header_image && (
        <div style={{ height: 110, position: "relative", overflow: "hidden" }}>
          <img
            src={payload.header_image}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => { e.target.style.visibility = "hidden"; }}
          />
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(180deg, transparent 30%, ${tolopea}E6 100%)`,
          }} />
          <div style={{ position: "absolute", left: 16, bottom: 10, color: "#fff" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: gold, textTransform: "uppercase" }}>
              📔 {payload.day_label}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{payload.title}</div>
          </div>
        </div>
      )}
      <div style={{ padding: "10px 16px", display: "flex", gap: 16, borderBottom: "1px solid #F2EEE7" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: red }}>{stats.venues || 0}</div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Venues</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: red }}>{stats.photos || 0}</div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Photos</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: red }}>{stats.music_plays || 0}</div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Tracks</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: red }}>${(stats.folio_today || 0).toFixed(0)}</div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>Today</div>
        </div>
      </div>
      <div style={{ padding: "8px 16px" }}>
        {moments.map((m, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 13, color: "#0A0A0A" }}>
            <div style={{ width: 22, textAlign: "center", flexShrink: 0 }}>{m.icon}</div>
            <div style={{ flex: 1, lineHeight: 1.3 }}>{m.label}</div>
            {m.value && <div style={{ fontSize: 12, color: "#888", fontFamily: "ui-monospace, monospace" }}>{m.value}</div>}
          </div>
        ))}
      </div>
      {payload.shareable_footer && (
        <div style={{ padding: "10px 16px", borderTop: "1px solid #F2EEE7", fontSize: 12, fontStyle: "italic", color: red, textAlign: "center" }}>
          {payload.shareable_footer}
        </div>
      )}
    </div>
  );
}

// ── Marenova: Squad Mode — cosmetic group coordination card ──────────────────
// Mock guest directory for the squad-event swap modal. Hardcoded — no real
// address book in the demo. Names chosen to feel like the kind of guests a
// returning guest might have cruised with before.
const SQUAD_DIRECTORY = [
  { name: "Lisa P.",   sub: "3 voyages together" },
  { name: "Marcus T.", sub: "Met on Aurora Cay 2024" },
  { name: "Priya R.",  sub: "Starlight Party '24" },
  { name: "Andre J.",  sub: "Drag Brunch crew" },
  { name: "Sofia M.",  sub: "Karaoke night regular" },
  { name: "Wei C.",    sub: "Couples Massage swap" },
  { name: "Hana K.",   sub: "Agave Coast dinner '23" },
  { name: "Jules B.",  sub: "Starlight Lounge neighbour" },
];

function ContactPickerModal({ mode, currentInvitees, swapping, onPick, onClose }) {
  // mode: "swap" (replacing `swapping`) or "add" (inviting someone new)
  const red = "#CC0000";
  const tolopea = "#2E0444";
  const gold = "#D4A862";
  const taken = new Set(currentInvitees || []);
  const available = SQUAD_DIRECTORY.filter(s => mode === "swap" ? s.name !== swapping : !taken.has(s.name));
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        animation: "card-slide-up 160ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, maxWidth: 360, width: "100%",
          maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{
          padding: "14px 16px",
          background: `linear-gradient(135deg, ${tolopea} 0%, ${red} 100%)`,
          color: "#fff",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: gold, textTransform: "uppercase" }}>
            {mode === "swap" ? `Swap ${swapping}` : "Invite a guest"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
            {mode === "swap" ? "Pick a replacement" : "Add to your Starlight Deck Party group"}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {available.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: "#888", textAlign: "center" }}>
              No more guests to suggest right now.
            </div>
          ) : available.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => onPick(s.name)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 16px", width: "100%", textAlign: "left",
                background: "none", border: "none", borderBottom: "1px solid #F2EEE7",
                cursor: "pointer", fontSize: 14, color: "#0A0A0A",
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: "50%", background: "#F2EEE7",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0,
              }}>👤</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{s.sub}</div>
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "12px 16px", border: "none", background: "#F2EEE7",
            color: "#0A0A0A", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SquadEventCard({ payload, onAction }) {
  const red = "#CC0000";
  const tolopea = "#2E0444";
  const gold = "#D4A862";
  const invitees = payload.invitees || [];
  // picker: { mode: "swap"|"add", swapping?: string } | null
  const [picker, setPicker] = useState(null);

  const interactive = !!payload.is_demo_data;

  const handleSwap = (oldName) => {
    if (!interactive) return;
    setPicker({ mode: "swap", swapping: oldName });
  };
  const handleAdd = () => {
    if (!interactive) return;
    setPicker({ mode: "add" });
  };
  const handlePick = (newName) => {
    const occ = payload.occasion || "Starlight Deck Party";
    const msg = picker?.mode === "swap"
      ? `Swap ${picker.swapping} for ${newName} in my ${occ} squad`
      : `Add ${newName} to my ${occ} squad`;
    setPicker(null);
    if (onAction) onAction(msg);
  };
  return (
    <>
      <div style={{ ...cardBase, borderColor: "#F0D8D8", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", background: `linear-gradient(135deg, ${tolopea} 0%, ${red} 100%)`, color: "#fff" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: gold, textTransform: "uppercase", marginBottom: 4 }}>
            👥 Squad · {payload.occasion}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>Group of {payload.party_size}</div>
        </div>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F2EEE7" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            {payload.invitee_label || "Squad invited"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={pill(`${red}1A`, red)}>👤 You</span>
            {invitees.map((n, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSwap(n)}
                title={interactive ? "Tap to swap this guest" : undefined}
                style={{
                  ...pill("#F2EEE7", interactive ? "#888" : "#0A0A0A"),
                  border: interactive ? "1px dashed #C8C2B5" : "1px solid transparent",
                  fontStyle: interactive ? "italic" : "normal",
                  opacity: interactive ? 0.85 : 1,
                  cursor: interactive ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
              >
                👤 {n}
              </button>
            ))}
            {interactive && (
              <button
                type="button"
                onClick={handleAdd}
                title="Invite another guest"
                style={{
                  ...pill(`${gold}1A`, "#7A5A1B"),
                  fontSize: 10,
                  border: `1px solid ${gold}55`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                + invite your own
              </button>
            )}
          </div>
          {payload.invitee_hint && (
            <div style={{ fontSize: 11, color: "#888", fontStyle: "italic", marginTop: 6, lineHeight: 1.3 }}>
              {payload.invitee_hint}
            </div>
          )}
        </div>
        <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
            <span style={{ width: 22, textAlign: "center" }}>💅</span>
            <span style={{ flex: 1, color: "#0A0A0A" }}>{payload.salon_window}</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
            <span style={{ width: 22, textAlign: "center" }}>🍸</span>
            <span style={{ flex: 1, color: "#0A0A0A" }}>{payload.rendezvous}</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
            <span style={{ width: 22, textAlign: "center" }}>🎶</span>
            <span style={{ flex: 1, color: "#0A0A0A" }}>{payload.manor_table_label} · {payload.manor_table_time}</span>
          </div>
        </div>
        {payload.share_link && (
          <div style={{ padding: "8px 16px 12px", borderTop: "1px solid #F2EEE7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#888", fontFamily: "ui-monospace, monospace" }}>#{payload.confirmation_id}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: red }}>Send the squad link ↗</span>
          </div>
        )}
      </div>
      {picker && (
        <ContactPickerModal
          mode={picker.mode}
          swapping={picker.swapping}
          currentInvitees={invitees}
          onPick={handlePick}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

// ── Marenova: Pre-show drink pairing recommendation ───────────────────────────
function DrinkPairingCard({ payload }) {
  const purple = "#2E0444";
  return (
    <div style={{ ...cardBase, borderColor: "#C9B8DC" }}>
      <div style={headerStrip(purple)} />
      <h3 style={{ ...title, color: purple, marginBottom: 4 }}>🍸 {payload.drink}</h3>
      <div style={{ ...subtle, marginBottom: 8 }}>
        {payload.venue} · Deck {payload.deck} · ${(payload.price || 0).toFixed(2)}
      </div>
      {payload.note && <div style={{ fontSize: 13, color: "#4A4A4A" }}>{payload.note}</div>}
    </div>
  );
}

const REGISTRY = {
  today: TodayCard,
  dining: DiningCard,
  show: ShowCard,
  cancel: CancelCard,
  reservations: ReservationsCard,
  spa_booking: SpaBookingCard,
  excursion: ExcursionCard,
  folio: FolioCard,
  drink_package: DrinkPackageCard,
  drink_package_option: DrinkPackageOptionCard,
  weather: WeatherCard,
  error: ErrorCard,
  champagne: ChampagneCard,
  outfit_suggestion: OutfitSuggestionCard,
  outfit_confirmed: OutfitConfirmedCard,
  salon_booking: SalonBookingCard,
  manor_table: ManorTableCard,
  drink_pairing: DrinkPairingCard,
  recovery_menu: RecoveryMenuCard,
  now_playing_track: NowPlayingTrackCard,
  surprise_summary: SurpriseSummaryCard,
  port_day_plan: PortDayPlanCard,
  packing_list: PackingListCard,
  voyage_diary: VoyageDiaryCard,
  squad_event: SquadEventCard,
};

function SingleCard({ payload, onAction }) {
  const Cmp = REGISTRY[payload.card];
  if (!Cmp) return null;
  return <Cmp payload={payload} onAction={onAction} />;
}

export default function ConciergeCard({ payload, onAction }) {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    return <>{payload.map((p, i) => <SingleCard key={i} payload={p} onAction={onAction} />)}</>;
  }
  return <SingleCard payload={payload} onAction={onAction} />;
}
