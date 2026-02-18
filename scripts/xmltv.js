import { create } from "xmlbuilder2";

export function buildXmltv({ channels, programmes, generatorInfoName = "Lebanon EPG Generator" }) {
  const root = create({ version: "1.0", encoding: "UTF-8" })
    .ele("tv", {
      "generator-info-name": generatorInfoName
    });

  for (const ch of channels) {
    const chEle = root.ele("channel", { id: ch.id });
    chEle.ele("display-name").txt(ch.name);
    if (ch.icon) chEle.ele("icon", { src: ch.icon });
  }

  for (const p of programmes) {
    const pEle = root.ele("programme", {
      start: p.start,
      stop: p.stop,
      channel: p.channelId
    });

    pEle.ele("title", { lang: p.lang ?? "en" }).txt(p.title ?? "");
    if (p.desc) pEle.ele("desc", { lang: p.lang ?? "en" }).txt(p.desc);
  }

  return root.end({ prettyPrint: true });
}
