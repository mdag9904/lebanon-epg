import { DateTime } from "luxon";
import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";

const ZONE = "Asia/Beirut";

// Turn on in GitHub Actions by setting env vars:
// DEBUG_LBC=1
// DEBUG_LBC_DAYS=1 (optional, default 1)
// DEBUG_LBC_SAVE=1 (optional; saves debug files into ./debug)

const DEBUG = process.env.DEBUG_LBC === "1";
const DEBUG_SAVE = process.env.DEBUG_LBC_SAVE === "1";
const DEBUG_DAYS = Number(process.env.DEBUG_LBC_DAYS || "1");

export async function buildLbcProgrammes({ channelId, daysAhead = 7, channelNum = 1 }) {
  const now = DateTime.now().setZone(ZONE).startOf("day");
  const programmes = [];

  for (let i = 0; i < daysAhead; i++) {
    const date = now.plus({ days: i });
    const dateStr = date.toFormat("yyyy-MM-dd");

    const url = `https://www.lbcgroup.tv/schedule-channels-date/${channelNum}/${date.toFormat("yyyy")}/${date.toFormat("MM")}/${date.toFormat("dd")}/en`;

    const html = await fetchText(url);
    const $ = cheerio.load(html);

    // Your current approach: parse visible text
    const text = $("body").text();
    const blocks = extractScheduleBlocks(text);

    // DEBUG: print + optionally save raw and parsed
    if (DEBUG && i < DEBUG_DAYS) {
      await debugLbcDump({ dateStr, url, html, blocks });
    }

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

    const maybeDesc = lines[i + 3] ?? "";
    const isNextTime = /^\d{1,2}:\d{2}$/.test(maybeDesc);
    const isDur = /Duration:/i.test(maybeDesc);

    const desc = (!isNextTime && !isDur) ? maybeDesc : "";

    blocks.push({ hh, mm, durationMin, title, desc });

    i = i + 2;
  }

  return blocks;
}

function toXmltvTimestamp(dt) {
  const base = dt.toFormat("yyyyMMddHHmmss");
  const off = dt.toFormat("ZZ").replace(":", "");
  return `${base} ${off}`;
}

async function debugLbcDump({ dateStr, url, html, blocks }) {
  // 1) Log a compact preview table to Actions output
  console.log(`\n[LBC DEBUG] ${dateStr} ${url}`);
  console.log(`[LBC DEBUG] Extracted blocks: ${blocks.length}`);

  const preview = blocks.slice(0, 60).map((b, idx) => ({
    idx,
    time: `${String(b.hh).padStart(2, "0")}:${String(b.mm).padStart(2, "0")}`,
    durMin: b.durationMin,
    title: (b.title ?? "").slice(0, 80),
    desc: (b.desc ?? "").slice(0, 60)
  }));

  console.table(preview);

  // Extra: highlight suspicious rows (common when alignment breaks)
  const suspicious = blocks
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) =>
      !Number.isFinite(b.durationMin) ||
      b.durationMin <= 0 ||
      b.durationMin > 6 * 60 ||               // > 6 hours looks wrong for most schedule blocks
      !b.title ||
      b.title.length < 2
    )
    .slice(0, 30)
    .map(({ b, idx }) => ({
      idx,
      time: `${String(b.hh).padStart(2, "0")}:${String(b.mm).padStart(2, "0")}`,
      durMin: b.durationMin,
      title: (b.title ?? "").slice(0, 80)
    }));

  if (suspicious.length) {
    console.log("[LBC DEBUG] Suspicious rows (check parsing alignment):");
    console.table(suspicious);
  }

  // 2) Optionally save raw HTML + parsed blocks to repo workspace
  // (Then you can upload as artifact in the workflow.)
  if (DEBUG_SAVE) {
    await fs.mkdir("debug", { recursive: true });

    await fs.writeFile(
      path.join("debug", `lbc-${dateStr}.html`),
      html,
      "utf8"
    );

    await fs.writeFile(
      path.join("debug", `lbc-${dateStr}.json`),
      JSON.stringify({ dateStr, url, count: blocks.length, blocks }, null, 2),
      "utf8"
    );

    // Also save the first ~400 "lines" your parser saw (super useful)
    const lines = html
      .replace(/\r/g, "")
      .split("\n")
      .slice(0, 400)
      .join("\n");

    await fs.writeFile(
      path.join("debug", `lbc-${dateStr}-html-head.txt`),
      lines,
      "utf8"
    );

    console.log(`[LBC DEBUG] Saved debug files to ./debug for ${dateStr}`);
  }
}
