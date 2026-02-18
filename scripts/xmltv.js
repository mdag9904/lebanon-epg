import { create } from "xmlbuilder2";

function cleanText(input) {
  if (input == null) return null;
  let s = String(input);

  // Strip HTML tags (LBC descriptions often include <p>, <br>, etc.)
  s = s.replace(/<[^>]*>/g, " ");

  // Fix HTML entities that are invalid in XML
  s = s.replace(/&nbsp;/g, " ");

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
  return escapeXml(cleanText(input));
}

export function buildXmltv({ channels, programmes, generatorInfoName = "Lebanon EPG Generator" }) {
  const root = create({ version: "1.0", encoding: "UTF-8" })
    .ele("tv", { "generator-info-name": generatorInfoName });

  for (const ch of channels) {
    const chEle = root.ele("channel", { id: ch.id });
    chEle.ele("display-name").txt(xmlText(ch.name) || "");
    if (ch.icon) chEle.ele("icon", { src: ch.icon });
  }

  for (const p of programmes) {
    const pEle = root.ele("programme", {
      start: p.start,
      stop: p.stop,
      channel: p.channelId
    });

    pEle.ele("title", { lang: p.lang ?? "en" }).txt(xmlText(p.title) || "");
    if (p.desc) pEle.ele("desc", { lang: p.lang ?? "en" }).txt(xmlText(p.desc) || "");
  }

  return root.end({ prettyPrint: true });
}
