import { useState, useEffect } from 'react';
import { useGuest } from '../../context/GuestContext';

const S = {
  card: {
    background: 'linear-gradient(135deg, #014E8F 0%, #006994 100%)',
    margin: '12px 12px 0',
    borderRadius: 16,
    padding: '14px 16px',
    color: '#fff',
    boxShadow: '0 4px 16px rgba(1,78,143,0.25)',
  },
  topRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  portLabel: {
    fontSize: 11, fontWeight: 700,
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  statusBadge: (seaDay) => ({
    background: seaDay ? 'rgba(255,255,255,0.15)' : 'rgba(255,199,44,0.2)',
    border: `1px solid ${seaDay ? 'rgba(255,255,255,0.25)' : 'rgba(255,199,44,0.4)'}`,
    color: seaDay ? 'rgba(255,255,255,0.8)' : '#FFC72C',
    fontSize: 11, fontWeight: 700,
    padding: '2px 10px', borderRadius: 20,
  }),
  countdown: {
    display: 'flex', alignItems: 'baseline', gap: 6,
    marginBottom: 4,
  },
  countNum: {
    fontSize: 36, fontWeight: 800,
    lineHeight: 1, letterSpacing: -1,
    fontVariantNumeric: 'tabular-nums',
    textShadow: '0 2px 12px rgba(0,0,0,0.3)',
  },
  countSep: {
    fontSize: 28, fontWeight: 300, opacity: 0.5,
  },
  countUnit: {
    fontSize: 11, color: 'rgba(255,255,255,0.6)',
    fontWeight: 600, letterSpacing: 0.5,
    alignSelf: 'flex-end', marginBottom: 4,
  },
  subLine: {
    fontSize: 12, color: 'rgba(255,255,255,0.65)',
    marginBottom: 10,
  },
  weatherRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 0 0',
    borderTop: '1px solid rgba(255,255,255,0.12)',
  },
  weatherItem: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 13, color: 'rgba(255,255,255,0.85)',
  },
  weatherIcon: { fontSize: 16 },
  seaDayMsg: {
    fontSize: 20, fontWeight: 700,
    marginBottom: 4, letterSpacing: -0.3,
  },
};

function parseETA(dateStr, timeStr) {
  if (!dateStr) return null;
  // arrival_date: "2026-05-06", all_aboard_time: "16:30"
  const dt = new Date(`${dateStr}T${timeStr || '09:00'}:00`);
  return dt > Date.now() ? dt : null;
}

function formatCountdown(targetDate) {
  const diff = targetDate - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { h, m, s };
}

function useWeather(port) {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    if (!port) return;
    // Port coordinates
    const coords = {
      Nassau:   { lat: 25.05, lon: -77.35 },
      Cozumel:  { lat: 20.42, lon: -86.92 },
      Belize:   { lat: 17.50, lon: -88.19 },
      Miami:    { lat: 25.77, lon: -80.19 },
    };
    const key = Object.keys(coords).find(k => port.includes(k));
    if (!key) return;
    const { lat, lon } = coords[key];
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`)
      .then(r => r.json())
      .then(data => {
        const cw = data.current_weather;
        if (cw) setWeather({ temp: Math.round(cw.temperature), code: cw.weathercode, wind: Math.round(cw.windspeed) });
      })
      .catch(() => {});
  }, [port]);

  return weather;
}

function weatherIcon(code) {
  if (code == null) return '🌤';
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫';
  if (code <= 67) return '🌧';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦';
  if (code <= 99) return '⛈';
  return '🌤';
}

export default function TodayCard() {
  const { guestData } = useGuest();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!guestData?.cruise) return null;
  const { todayLabel, nextPort } = guestData.cruise;

  const isSeaDay = !todayLabel || todayLabel === 'At Sea';
  const portName = nextPort?.name || todayLabel;
  const weather = useWeather(portName);

  let countdown = null;
  if (nextPort?.arrival_date) {
    const target = parseETA(nextPort.arrival_date, nextPort.arrival_time || nextPort.all_aboard_time);
    if (target) countdown = formatCountdown(target);
  }

  return (
    <div style={S.card}>
      <div style={S.topRow}>
        <span style={S.portLabel}>
          {isSeaDay ? 'Today · Sea Day' : `Today · ${todayLabel}`}
        </span>
        <span style={S.statusBadge(isSeaDay)}>
          {isSeaDay ? '⚓ At Sea' : '🗺 Port Day'}
        </span>
      </div>

      {countdown ? (
        <>
          <div style={S.countdown}>
            <span style={S.countNum}>{String(countdown.h).padStart(2, '0')}</span>
            <span style={S.countSep}>:</span>
            <span style={S.countNum}>{String(countdown.m).padStart(2, '0')}</span>
            <span style={S.countSep}>:</span>
            <span style={S.countNum}>{String(countdown.s).padStart(2, '0')}</span>
          </div>
          <div style={S.subLine}>until we arrive in {nextPort.name}</div>
        </>
      ) : (
        <div style={S.seaDayMsg}>
          {isSeaDay ? 'Enjoying the open sea 🌊' : `In port — ${todayLabel}`}
        </div>
      )}

      {weather && (
        <div style={S.weatherRow}>
          <div style={S.weatherItem}>
            <span style={S.weatherIcon}>{weatherIcon(weather.code)}</span>
            <span>{weather.temp}°F</span>
          </div>
          <div style={S.weatherItem}>
            <span style={S.weatherIcon}>💨</span>
            <span>{weather.wind} mph</span>
          </div>
          <div style={S.weatherItem}>
            <span style={S.weatherIcon}>📍</span>
            <span>{portName}</span>
          </div>
        </div>
      )}
    </div>
  );
}
