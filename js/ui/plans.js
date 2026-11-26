// plans.js — „Link kopieren“ (Zwischenablage, Fallback: Feld markieren) und gespeicherte Pläne.
import { h, clear, focusKey } from "./dom.js";
import { t, getLang } from "../i18n.js";
import { getState, update, shareUrl, listPlans, savePlan, loadPlan, deletePlan } from "../state.js";

const CONFIRM_MS = 2000;

export function createPlans(root) {
  const copyBtn = h("button", { type: "button", class: "btn", "data-fkey": "share-copy", onclick: copy });
  const status = h("span", { class: "status muted small", role: "status", "aria-live": "polite" });
  const linkField = h("input", { type: "text", class: "text-input", readOnly: true, hidden: true, "data-fkey": "share-link" });
  const shareBox = h("div", { class: "share" }, h("div", { class: "share-row" }, copyBtn, status), linkField);

  const title = h("h2", { class: "section-title", id: "plans-title" });
  const nameLabel = h("label", { for: "plan-name", class: "sr-only" });
  const nameInput = h("input", { id: "plan-name", type: "text", class: "text-input", autocomplete: "off", "data-fkey": "plan-name" });
  const saveBtn = h("button", { type: "submit", class: "btn", "data-fkey": "plan-save" });
  const form = h("form", { class: "plan-form", onsubmit: save }, nameLabel, nameInput, saveBtn);
  const listBox = h("div", { class: "plan-list-box" });
  const plansBox = h("section", { class: "plans", "aria-labelledby": "plans-title" }, title, form, listBox);

  root.append(shareBox, plansBox);
  let timer = null;

  async function copy() {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      linkField.hidden = true;
      announce(t("share.copied"));
    } catch {
      linkField.value = url;
      linkField.hidden = false;
      linkField.setAttribute("aria-label", t("share.link"));
      linkField.focus();
      linkField.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      if (copied) {
        linkField.hidden = true;
        copyBtn.focus();
      }
      announce(t(copied ? "share.copied" : "share.manual"));
    }
  }

  function announce(text) {
    status.textContent = text;
    clearTimeout(timer);
    timer = setTimeout(() => {
      status.textContent = "";
    }, CONFIRM_MS);
  }

  function save(e) {
    e.preventDefault();
    if (!savePlan(nameInput.value)) {
      nameInput.focus();
      return;
    }
    nameInput.value = "";
    renderList();
  }

  function load(name) {
    const lang = getState().lang;
    const st = loadPlan(name);
    // Die aktuelle Sprache bleibt, auch wenn der Plan in einer anderen gespeichert wurde.
    if (st && st.lang !== lang) update({ lang });
  }

  function remove(name, index) {
    deletePlan(name);
    const rest = listPlans();
    renderList();
    if (rest.length) focusKey(`plan-delete-${rest[Math.min(index, rest.length - 1)].name}`);
    else nameInput.focus();
  }

  function renderList() {
    clear(listBox);
    const plans = listPlans();
    if (plans.length === 0) {
      listBox.append(h("p", { class: "muted small" }, t("plans.none")));
      return;
    }
    const fmt = new Intl.DateTimeFormat(getLang() === "de" ? "de-DE" : "en-US", { dateStyle: "medium", timeStyle: "short" });
    const ul = h("ul", { class: "plan-list", "aria-label": t("plans.saved") });
    plans.forEach((p, i) => {
      const nameId = `plan-name-${i}`;
      ul.append(
        h(
          "li",
          { class: "plan-item" },
          h(
            "div",
            { class: "plan-info" },
            h("span", { class: "plan-name", id: nameId, title: p.name }, p.name),
            p.savedAt ? h("span", { class: "muted small" }, fmt.format(new Date(p.savedAt))) : null,
          ),
          h(
            "div",
            { class: "plan-actions" },
            h("button", { type: "button", class: "text-btn", "aria-describedby": nameId, "data-fkey": `plan-load-${p.name}`, onclick: () => load(p.name) }, t("plans.load")),
            h("button", { type: "button", class: "text-btn", "aria-describedby": nameId, "data-fkey": `plan-delete-${p.name}`, onclick: () => remove(p.name, i) }, t("plans.delete")),
          ),
        ),
      );
    });
    listBox.append(ul);
  }

  function render() {
    copyBtn.textContent = t("share.copy");
    title.textContent = t("plans.title");
    nameLabel.textContent = t("plans.name");
    nameInput.placeholder = t("plans.name");
    saveBtn.textContent = t("plans.save");
    renderList();
  }

  return { render };
}
