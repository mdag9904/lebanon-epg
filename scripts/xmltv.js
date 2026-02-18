import { create } from "xmlbuilder2";

function cleanText(input) {
  if (input == null) return null;
  let s = String(input);

  // Strip HTML tags (some sources include <p>, <br>, etc.)
  s = s.replace(/<[^>]*>/g, " ");

  // Decode common HTML entities into real characters (so apps display nice punctuation)
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&rsquo;|&#8217;|&#x2019;/gi, "’")
    .replace(/&lsquo;|&#8216;|&#x2018;/gi, "‘")
    .replace(/&ldquo;|&#8220;|&#x201C;/gi, "“")
    .replace(/&rdquo;|&#8221;|&#x201D;/gi, "”")
    .replace(/&mdash;|&#8212;|&#x2014;/gi, "—")
    .replace(/&ndash;|&#8211;|&#x2013;/gi, "–")
    // decode &amp; LAST so we don't break sequences above
    .replace(/&amp;/gi, "&");

  // Normalise whitespace
  s = s.replace(/\s+/g, " ").trim();

  return s || null;
}

function escapeXml(input) {
  if (input == null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlText(input) {
  const cleaned = cleanText(input);
  return cleaned ? escapeXml(cleaned) : "";
}

export function buildXmltv({
  channels,
  programmes,
  generatorInfoName = "Lebanon EPG Generator"
}) {
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("tv", {
    "generator-info-name": generatorInfoName
  });

  for (const ch of channels) {
    const chEle = root.ele("channel", { id: ch.id });
    chEle.ele("display-name").txt(xmlText(ch.name));
    if (ch.icon) chEle.ele("icon", { src: ch.icon });
  }

  for (const p of programmes) {
    const pEle = root.ele("programme", {
      start: p.start,
      stop: p.stop,
      channel: p.channelId
    });

    pEle.ele("title", { lang: p.lang ?? "en" }).txt(xmlText(p.title));
    if (p.desc) pEle.ele("desc", { lang: p.lang ?? "en" }).txt(xmlText(p.desc));
  }

  return root.end({ prettyPrint: true });
}
