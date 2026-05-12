// Pre-loaded "props" the presenter can show to the avatar during the demo.
// Each click streams the bundled image to the backend Qwen Omni vision endpoint
// and surfaces the result as a synthetic chat turn.
import { activeTheme as theme } from "../../styles/branding";

// Update this list after dropping new files into frontend/public/demo-props/.
// Keep id aligned with the JPEG filename in backend/app/data/demo_props/<id>.jpg.
// promptHint is what the agent will treat as the user's spoken intent when the
// thumbnail is clicked — Qwen Omni's image description is appended to it.
export const DEMO_PROPS = [
  {
    id: "cozumel-ticket",
    label: "Cozumel snorkel ticket",
    img: "/demo-props/cozumel-ticket.jpg",
    promptHint:
      "Read this excursion ticket and tell me when and where to meet, and what to bring.",
  },
  {
    id: "cucina-menu",
    label: "Cucina del Capitano menu",
    img: "/demo-props/cucina-menu.jpg",
    promptHint: "Read this menu and recommend something I'd enjoy.",
  },
  {
    id: "wine-label",
    label: "Wine label",
    img: "/demo-props/wine-label.jpg",
    promptHint:
      "Tell me about this wine — varietal, region, and what it pairs with.",
  },
  {
    id: "allergy-card",
    label: "Camp Ocean allergy card",
    img: "/demo-props/allergy-card.jpg",
    promptHint:
      "Read my child's allergy card and flag anything on tonight's dining options.",
  },
  {
    id: "keycard",
    label: "Sail & Sign card",
    img: "/demo-props/keycard.jpg",
    promptHint: "Look up the cabin and folio attached to this Sail & Sign card.",
  },
];

const showWebcam =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("webcam") === "1";

export default function ShowThisStrip({ onShow, onWebcam, disabled }) {
  return (
    <div style={styles.wrap}>
      <div style={styles.label}>Show this</div>
      <div style={styles.row}>
        {DEMO_PROPS.map((p) => (
          <button
            key={p.id}
            disabled={disabled}
            onClick={() => onShow && onShow(p)}
            style={{ ...styles.thumb, opacity: disabled ? 0.5 : 1 }}
            title={p.label}
          >
            <img
              src={p.img}
              alt={p.label}
              style={styles.img}
              onError={(e) => { e.currentTarget.style.opacity = 0.2; }}
            />
            <span style={styles.thumbLabel}>{p.label}</span>
          </button>
        ))}
        {showWebcam && (
          <button
            disabled={disabled}
            onClick={() => onWebcam && onWebcam()}
            style={{ ...styles.thumb, opacity: disabled ? 0.5 : 1 }}
            title="Use webcam (Plan-B)"
          >
            <div style={{ ...styles.img, display: "flex", alignItems: "center", justifyContent: "center" }}>
              📷
            </div>
            <span style={styles.thumbLabel}>Use webcam</span>
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    borderTop: `1px solid ${theme.border.weak}`,
    background: theme.background.back,
  },
  label: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.text.weak,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  row: {
    display: "flex",
    gap: theme.spacing.sm,
    overflowX: "auto",
    paddingBottom: 4,
  },
  thumb: {
    flex: "0 0 auto",
    border: `1px solid ${theme.border.weak}`,
    borderRadius: theme.borderRadius.sm,
    background: "white",
    padding: 4,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    width: 96,
  },
  img: {
    width: 88,
    height: 56,
    objectFit: "cover",
    borderRadius: 2,
    background: "#eee",
  },
  thumbLabel: {
    fontSize: 10,
    color: theme.text.weak,
    textAlign: "center",
    lineHeight: 1.1,
  },
};
