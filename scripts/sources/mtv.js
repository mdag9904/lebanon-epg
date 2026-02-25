import { DateTime } from "luxon";

const BASE = "https://www.mtv.com.lb/en/api/schedule";
const ZONE = "Asia/Beirut";

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, { retries = 4, timeoutMs = 15000 } = {}) {
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal
      });

      if (!res.ok) {
        const msg = `MTV fetch failed: ${res.status} ${res.statusText} (${url})`;

        if (RETRY_STATUSES.has(res.status) && attempt < retries) {
          const backoff = 600 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
          console.warn(
            `[MTV] ${msg} — retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`
          );
          await sleep(backoff);
          continue;
        }

        throw new Error(msg);
      }

      return await res.json();
    } catch (e) {
      lastErr = e;

      if (attempt < retries) {
        const backoff = 600 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        console.warn(
          `[MTV] ${String(e)} — retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`
        );
        await sleep(backoff);
        continue;
      }

      throw lastErr;
    } finally {
      clearTimeout(t);
    }
  }

  throw lastErr ?? new Error(`MTV fetch failed (${url})`);
}

/**
 * Returns mapping like: { Monday: 6, Tuesday: 7, ... }
 * Tries /days first, then /daysand, then falls back to known IDs.
 */
export async function getMtvDayMap() {
  const candidates = [`${BASE}/days`, `${BASE}/daysand`];

  let days = null;
  for (const url of candidates) {
    try {
      const data = await fetchJson(url);
      if (Array.isArray(data) && data.length) {
        days = data;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  // Hard fallback so builds don't break if MTV changes/blocks an endpoint.
  const fallback = [
    { Title: "Monday", Id: 6 },
    { Title: "Tuesday", Id: 7 },
    { Title: "Wednesday", Id: 8 },
    { Title: "Thursday", Id: 9 },
    { Title: "Friday", Id: 10 },
    { Title: "Saturday", Id: 11 },
    { Title: "Sunday", Id: 12 }
  ];

  const list = Array.isArray(days) && days.length ? days : fallback;

  const map = {};
  for (const d of list) map[d.Title] = d.Id;
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
 *
 * Change: if a given day endpoint fails (e.g. 500), we skip that day instead of failing the build.
 */
export async function buildMtvProgrammes({ channelId, daysAhead = 7 }) {
  const dayMap = await getMtvDayMap();

  const weekdayToTitle = {
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
    7: "Sunday"
  };

  const now = DateTime.now().setZone(ZONE).startOf("day");
  const programmes = [];

  for (let i = 0; i < daysAhead; i++) {
    const date = now.plus({ days: i });
    const title = weekdayToTitle[date.weekday];
    const dayId = dayMap[title];

    if (!dayId) continue;

    let items;
    try {
      items = await getMtvScheduleForDayId(dayId);
    } catch (e) {
      console.warn(
        `[MTV] Failed day fetch for ${title} (dayId=${dayId}). Skipping day. Error: ${String(e)}`
      );
      continue;
    }

    const parsed = (Array.isArray(items) ? items : [])
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
  const base = dt.toFormat("yyyyMMddHHmmss");
  const off = dt.toFormat("ZZ").replace(":", "");
  return `${base} ${off}`;
}
