/**
 * Skart Malta Card
 * A minimal, customisable Lovelace card for the Skart Malta integration.
 *
 * Example config:
 *   type: custom:skart-malta-card
 *   entity: sensor.skart_malta_today
 *   title: Rubbish today
 *   language: en        # "en" (default) or "mt" (Maltese)
 *   show_date: true
 *   colors:
 *     organic: "#4a7c2f"
 *     mixed: "#3a3a3a"
 *     recyclable: "#2f6fa0"
 *     glass: "#7a5230"
 */

// Icons and colours are language-independent.
const STREAM_STYLE = {
  organic: { icon: "mdi:leaf", color: "#4a7c2f" },
  mixed: { icon: "mdi:trash-can", color: "#3a3a3a" },
  recyclable: { icon: "mdi:recycle", color: "#2f6fa0" },
  glass: { icon: "mdi:bottle-wine", color: "#7a5230" },
  none: { icon: "mdi:calendar-blank", color: "#9aa0a6" },
};

// Labels per language. `label` is the headline, `sub` the secondary line.
const STREAM_LABELS = {
  en: {
    organic: { label: "Organic", sub: "White bag" },
    mixed: { label: "Mixed", sub: "Black bag" },
    recyclable: { label: "Recyclable", sub: "Grey bag" },
    glass: { label: "Glass", sub: "Bottles & jars" },
    none: { label: "No collection", sub: "Nothing today" },
  },
  mt: {
    organic: { label: "Organiku", sub: "Borża Bajda" },
    mixed: { label: "Imħallat", sub: "Borża Sewda" },
    recyclable: { label: "Riċiklabbli", sub: "Borża Griża" },
    glass: { label: "Ħġieġ", sub: "Flixkien u Vażetti" },
    none: { label: "Xejn", sub: "Ma jinġabarx skart illum" },
  },
};

const SUPPORTED_LANGS = Object.keys(STREAM_LABELS);

class SkartMaltaCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) {
      throw new Error("You must define an 'entity' (e.g. sensor.skart_malta_today).");
    }
    const language = SUPPORTED_LANGS.includes(config.language)
      ? config.language
      : "en";
    this._config = {
      title: config.title ?? "Waste collection",
      show_date: config.show_date ?? true,
      colors: config.colors ?? {},
      ...config,
      language,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _meta(stream) {
    const style = STREAM_STYLE[stream] ?? STREAM_STYLE.none;
    const labels = STREAM_LABELS[this._config.language] ?? STREAM_LABELS.en;
    const text = labels[stream] ?? labels.none;
    const override = this._config.colors[stream];
    return { ...text, ...style, color: override ?? style.color };
  }

  _render() {
    if (!this._hass || !this._config) return;
    const stateObj = this._hass.states[this._config.entity];
    if (!stateObj) {
      this.innerHTML = `<ha-card><div class="mw-missing">Entity not found: ${this._config.entity}</div></ha-card>`;
      this._injectStyle();
      return;
    }

    const streams = stateObj.attributes.streams ?? ["none"];
    const dateStr = stateObj.attributes.date;
    const locale = this._config.language === "mt" ? "mt-MT" : undefined;
    let dateLabel = "";
    if (this._config.show_date && dateStr) {
      dateLabel = new Date(dateStr).toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }

    const items = streams
      .map((s) => {
        const m = this._meta(s);
        return `
          <div class="mw-item" style="--mw-color:${m.color}">
            <div class="mw-swatch"><ha-icon icon="${m.icon}"></ha-icon></div>
            <div class="mw-text">
              <span class="mw-label">${m.label}</span>
              ${m.sub ? `<span class="mw-sub">${m.sub}</span>` : ""}
            </div>
          </div>`;
      })
      .join("");

    this.innerHTML = `
      <ha-card>
        <div class="mw-wrap">
          <div class="mw-header">
            <span class="mw-title">${this._config.title}</span>
            ${dateLabel ? `<span class="mw-date">${dateLabel}</span>` : ""}
          </div>
          <div class="mw-items">${items}</div>
        </div>
      </ha-card>`;
    this._injectStyle();
  }

  _injectStyle() {
    if (this.querySelector("style")) return;
    const style = document.createElement("style");
    style.textContent = `
      .mw-wrap { padding: 16px; }
      .mw-header { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:14px; }
      .mw-title { font-size:1.05rem; font-weight:600; color: var(--primary-text-color); }
      .mw-date { font-size:0.8rem; color: var(--secondary-text-color); }
      .mw-items { display:flex; flex-direction:column; gap:10px; }
      .mw-item { display:flex; align-items:center; gap:14px; padding:10px 12px;
                 border-radius:14px; background: color-mix(in srgb, var(--mw-color) 8%, transparent);
                 border-left:4px solid var(--mw-color); }
      .mw-swatch { display:flex; align-items:center; justify-content:center;
                   width:38px; height:38px; border-radius:50%;
                   background: var(--mw-color); color:#fff; flex-shrink:0; }
      .mw-swatch ha-icon { --mdc-icon-size:22px; }
      .mw-text { display:flex; flex-direction:column; line-height:1.25; }
      .mw-label { font-weight:600; color: var(--primary-text-color); }
      .mw-sub { font-size:0.78rem; color: var(--secondary-text-color); }
      .mw-missing { padding:16px; color: var(--error-color, #b00020); }
    `;
    this.appendChild(style);
  }

  getCardSize() {
    return 2;
  }

  static getStubConfig() {
    return { entity: "sensor.skart_malta_today", title: "Waste today" };
  }
}

customElements.define("skart-malta-card", SkartMaltaCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "skart-malta-card",
  name: "Skart Malta Card",
  description: "Shows the waste collection due for the day.",
});
