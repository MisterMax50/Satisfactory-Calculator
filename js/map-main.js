// map-main.js — Einstieg der Kartenseite (map.html). Link-Hash: #lang=de|en&res=<Rohstoff-IDs, kommagetrennt>.
import data from "../data/gamedata.js";
import { setLang, t } from "./i18n.js";
import { mapView } from "./ui/map.js";

const params = new URLSearchParams(location.hash.slice(1));
const wanted = params.get("lang");
const lang = wanted === "de" || wanted === "en" ? wanted : (navigator.language || "").toLowerCase().startsWith("de") ? "de" : "en";
setLang(lang);
document.documentElement.lang = lang;
document.title = `${t("tabs.map")} – ${t("app.title")}`;
// Unbekannte IDs filtert mapView weg (nur Rohstoffe der Karte zählen).
const plan = (params.get("res") || "").split(",").filter(Boolean);
document.getElementById("map").append(mapView(plan, data));
