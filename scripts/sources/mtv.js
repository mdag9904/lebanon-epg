import { DateTime } from "luxon";

const BASE = "https://www.mtv.com.lb/en/api/schedule";
const ZONE = "Asia/Beirut";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`MTV fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.json();
}

/**
 * Returns mapping like: { Monday: 6, Tuesday: 7, ... }
 */
export async function getMtvDayMap() {
  const days = await fetchJson(`${BASE}/daysand`);
  const map = {};
  for (const d of days) map[d.Title] = d.Id;
  return map;
}

/**
 * Fetch schedule list for a specific MTV "day id" (weekday id).
 */
export async function getMtvScheduleForDayId(dayId) {
  return fetchJson(`${BASE}/days/${dayId}`);
}

/**
 * Build programme items for the next N days, using weekday mapping.
 * MTV items only have start times; we infer stop as next start, else +60 min fallback.
 */
export async function buildMtvProgrammes({ channelId, daysAhead = 7 }) {
  const dayMap = await getMtvDayMap();

  // Map Luxon weekday (1=Mon..7=Sun) to the MTV dayId
  const weekdayToTitle = {
    1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday",
    5: "Friday", 6: "Saturday", 7: "Sunday"
  };

  const now = DateTime.now().setZone(ZONE).startOf("day");
  const programmes = [];

  for (let i = 0; i < daysAhead; i++) {
    const date = now.plus({ days: i });
    const title = weekdayToTitle[date.weekday];
    const dayId = dayMap[title];

    if (!dayId) continue;

    const items = await getMtvScheduleForDayId(dayId);

    // Normalise into { startDT, title, desc }
    const parsed = items
      .map((it) => {
        const raw = (it.Time ?? "").trim(); // e.g. "07:30"
        const m = raw.match(/^(\d{1,2}):(\d{2})/);
        if (!m) return null;

        const hh = Number(m[1]);
        const mm = Number(m[2]);

        const startDT = date.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
        const p = it.Program ?? {};
        return {
          startDT,
          title: p.Name ?? "Unknown",
          desc: (p.Description ?? "").replace(/\s+/g, " ").trim() || null
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.startDT.toMillis() - b.startDT.toMillis());

    for (let idx = 0; idx < parsed.length; idx++) {
      const cur = parsed[idx];
      const next = parsed[idx + 1];

      // Stop = next start, else +60 minutes fallback
      const stopDT = next ? next.startDT : cur.startDT.plus({ minutes: 60 });

      programmes.push({
        channelId,
        title: cur.title,
        desc: cur.desc,
        start: toXmltvTimestamp(cur.startDT),
        stop: toXmltvTimestamp(stopDT),
        lang: "en"
      });
    }
  }

  return programmes;
}

function toXmltvTimestamp(dt) {
  // XMLTV: YYYYMMDDHHMMSS +ZZZZ (no colon in offset)
  const base = dt.toFormat("yyyyMMddHHmmss");
  const off = dt.toFormat("ZZ").replace(":", ""); // +02:00 -> +0200
  return `${base} ${off}`;
}
