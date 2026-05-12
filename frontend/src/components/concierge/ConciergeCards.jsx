// Generative-UI cards rendered above the conversation when the agent calls a tool.
// Single file holds all variants to keep the demo footprint compact.
import { useState } from "react";
import { activeTheme as theme } from "../../styles/branding";

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
  const uid = `marina-${Date.now()}@carnival.com`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Marina//Carnival Celebration//EN",
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
          location: `${r.location}, Carnival Celebration`,
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
          location: `${s.venue}, Carnival Celebration`,
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
  return (
    <div style={cardBase}>
      <div style={headerStrip(theme.brand.sun || "#FFC72C")} />
      <div style={row}>
        <h3 style={title}>{p.name}</h3>
        <span style={pill(theme.brand.green, "white")}>Active · {payload.days} days</span>
      </div>
      <p style={subtle}>{p.covers}</p>
      <div style={{ ...row, marginTop: theme.spacing.md }}>
        <div>
          <div style={subtle}>Charged to folio</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold, fontSize: theme.typography.fontSizes.lg }}>${payload.total.toFixed(2)}</div>
        </div>
        <div>
          <div style={subtle}>New balance</div>
          <div style={{ fontWeight: theme.typography.fontWeights.bold, fontSize: theme.typography.fontSizes.lg }}>${payload.new_balance.toFixed(2)}</div>
        </div>
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
      {payload.savings > 0 && (
        <div style={{ ...pill("#E0F2F1", teal), display: "block", textAlign: "center", padding: "6px 12px", borderRadius: 8 }}>
          ✓ VIFP Gold 10% discount applied
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
  const coz = payload.cozumel || {};
  const onboard = payload.onboard || {};
  const showSnorkelTip = (coz.icon_key === "sunny" || coz.icon_key === "partly_cloudy") && (coz.uv_index || 0) >= 6;
  const uvLabel = (uv) => uv >= 8 ? "Very High" : uv >= 6 ? "High" : uv >= 3 ? "Moderate" : "Low";

  return (
    <div style={{ ...cardBase, borderColor: "#0EA5E9", padding: 0, overflow: "hidden" }}>
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
        <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>Marina ✦</span>
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

        {/* Right: Cozumel */}
        <div style={{ flex: 1, padding: "14px 16px", background: "#F0FDF4" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Cozumel Tomorrow</div>
            {payload.live && (
              <span style={{ background: "#F59E0B", color: "white", fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 999 }}>LIVE</span>
            )}
          </div>
          <div style={{ fontSize: 32 }}>{WEATHER_ICONS[coz.icon_key] || "☀️"}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#1E293B", lineHeight: 1.1 }}>{coz.temp_f}°F</div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{coz.condition}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>
            {coz.wind_mph && `Wind: ${coz.wind_mph} mph`}
            {coz.uv_index != null && ` · UV: ${uvLabel(coz.uv_index)} (${coz.uv_index})`}
          </div>
          {coz.humidity != null && (
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>Humidity: {coz.humidity}%</div>
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
  weather: WeatherCard,
  error: ErrorCard,
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
