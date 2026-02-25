import fs from "node:fs";
import path from "node:path";
import { buildXmltv } from "./xmltv.js";
import { buildMtvProgrammes } from "./sources/mtv.js";
import { buildLbcProgrammes } from "./sources/lbc.js";

const OUT_DIR = "docs";
const OUT_FILE = path.join(OUT_DIR, "epg.xml");

// Your IPTV channel IDs (must match your M3U / UHF mapping)
const CHANNELS = [
  {
    id: "mtvlebanon.lb",
    name: "MTV Lebanon UHD",
    icon: "http://portal-iptv.net:8080/images/MTV_Lebanon.png"
  },
  {
    id: "lbcinternational.lb",
    name: "LBC International UHD",
    icon: "http://portal-iptv.net:8080/images/LDC_LBC_int.png"
  }
];

async function main() {
  // Don’t let one source outage break the whole build.
  const [mtvRes, lbcRes] = await Promise.allSettled([
    buildMtvProgrammes({ channelId: "mtvlebanon.lb", daysAhead: 7 }),
    buildLbcProgrammes({ channelId: "lbcinternational.lb", daysAhead: 7, channelNum: 1 })
  ]);

  const mtv = mtvRes.status === "fulfilled" ? mtvRes.value : [];
  const lbc = lbcRes.status === "fulfilled" ? lbcRes.value : [];

  if (mtvRes.status === "rejected") {
    console.warn(`[BUILD] MTV failed: ${String(mtvRes.reason)} (continuing with LBC only)`);
  }
  if (lbcRes.status === "rejected") {
    console.warn(`[BUILD] LBC failed: ${String(lbcRes.reason)} (continuing with MTV only)`);
  }

  const programmes = [...mtv, ...lbc].sort((a, b) => a.start.localeCompare(b.start));

  const xml = buildXmltv({
    channels: CHANNELS,
    programmes,
    generatorInfoName: "Lebanon EPG (MTV + LBCI) – Asia/Beirut"
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, xml, "utf8");

  console.log(`Wrote ${OUT_FILE} with ${programmes.length} programmes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
