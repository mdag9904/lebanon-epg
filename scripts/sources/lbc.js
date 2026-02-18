import { DateTime } from "luxon";
import * as cheerio from "cheerio";

const ZONE = "Asia/Beirut";

/**
 * LBC daily schedule page example:
 * https://www.lbcgroup.tv/schedule-channels-date/1/2026/02/20/en
 *
 * We parse visible text and extract repeating blocks:
 * HH:MM
 * Duration: N min
 * Title line
 * (optional description line(s))
 */
export async function buildLbcProgrammes({ channelId, daysAhead = 7, channelNum = 1 }) {
  const now = DateTime.now().setZone(ZONE).startOf("day");
  const programmes = [];

  for (let i = 0; i < daysAhead; i++) {
    const date = now.plus({ days: i });

    const url = `https://www.lbcgroup.tv/schedule-channels-date/${channelNum}/${date.toFormat("yyyy")}/${date.toFormat("MM")}/${date.toFormat("dd")}/en`;

    const html = await fetchText(url);
    const $ = cheerio.load(html);

    // Parse visible text (less brittle than DOM-structure assumptions)
    const text = $("body").text();
    const blocks = extractScheduleBlocks(text);

    for (const b of blocks) {
      const startDT = date.set({ hour: b.hh, minute: b.mm, second: 0, millisecond: 0 });
      const stopDT = startDT.plus({ minutes: b.durationMin });

      programmes.push({
        channelId,
        title: b.title,
        desc: b.desc || null,
        start: toXmltvTimestamp(startDT),
        stop: toXmltvTimestamp(stopDT),
        lang: "en"
      });
    }
  }

  return programmes;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`LBC fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.text();
}

function extractScheduleBlocks(rawText) {
  // Normalise whitespace, but keep line-ish breaks
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    const timeMatch = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) continue;

    const durLine = lines[i + 1] ?? "";
    const durMatch = durLine.match(/Duration:\s*(\d+)\s*min/i);
    if (!durMatch) continue;

    const titleLine = lines[i + 2] ?? "";
    const title = titleLine.trim();
    if (!title) continue;

    const hh = Number(timeMatch[1]);
    const mm = Number(timeMatch[2]);
    const durationMin = Number(durMatch[1]);

    // Optional description: take the next line if it isn't a time or "Duration"
    const maybeDesc = lines[i + 3] ?? "";
    const isNextTime = /^\d{1,2}:\d{2}$/.test(maybeDesc);
    const isDur = /Duration:/i.test(maybeDesc);

    const desc = (!isNextTime && !isDur) ? maybeDesc : "";

    blocks.push({ hh, mm, durationMin, title, desc });

    // advance a bit to avoid re-detecting in the desc area
    i = i + 2;
  }

  return blocks;
}

function toXmltvTimestamp(dt) {
  const base = dt.toFormat("yyyyMMddHHmmss");
  const off = dt.toFormat("ZZ").replace(":", "");
  return `${base} ${off}`;
}
