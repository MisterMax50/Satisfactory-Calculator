// header.js — App-Titel und Sprachumschalter (2-Knopf-Segment DE | EN).
import { h, clear } from "./dom.js";
import { t } from "../i18n.js";
import { update } from "../state.js";

export function renderHeader(root, state) {
  clear(root);
  const btn = (lang, shortKey, longKey) =>
    h(
      "button",
      {
        type: "button",
        class: "seg-btn",
        lang,
        title: t(longKey),
        "aria-pressed": state.lang === lang ? "true" : "false",
        "data-fkey": `lang-${lang}`,
        onclick: () => {
          if (state.lang !== lang) update({ lang });
        },
      },
      t(shortKey),
    );
  root.append(
    h("h1", { class: "app-title" }, t("app.title")),
    h(
      "div",
      { class: "segment", role: "group", "aria-label": t("lang.label") },
      btn("de", "lang.deShort", "lang.de"),
      btn("en", "lang.enShort", "lang.en"),
    ),
  );
}
