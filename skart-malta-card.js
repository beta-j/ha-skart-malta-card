/**
 * Skart Malta Card
 * A minimal, customisable Lovelace card for the Skart Malta integration.
 *
 * Example config:
 *   type: custom:skart-malta-card
 *   entity: sensor.skart_malta_today
 *   tomorrow_entity: sensor.skart_malta_tomorrow   # enables roll-over to tomorrow
 *   title: Rubbish today
 *   language: en        # "en" (default) or "mt" (Maltese)
 *   rollover_hours: 3   # hours after collection_time before switching to tomorrow
 *   show_date: true
 *   colors:
 *     organic: "#4a7c2f"
 *     mixed: "#3a3a3a"
 *     recyclable: "#2f6fa0"
 *     glass: "#7a5230"
 *
 * Roll-over behaviour: if `tomorrow_entity` is set, the card shows today's
 * collection from midnight until `rollover_hours` after the collection time,
 * then switches to tomorrow's collection for the rest of the day. When showing
 * tomorrow, the heading is replaced with a "collection tomorrow" label.
 */

// Heading shown when the card has rolled over to tomorrow's collection.
const TOMORROW_HEADING = {
  en: "Collection tomorrow",
  mt: "Skart li jinġabar għada",
};

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
    glass: { label: "Ħġieġ", sub: "" },
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
    let rolloverHours = Number(config.rollover_hours);
    if (!Number.isFinite(rolloverHours) || rolloverHours < 0) {
      rolloverHours = 3;
    }
    this._config = {
      title: config.title ?? "Waste collection",
      show_date: config.show_date ?? true,
      colors: config.colors ?? {},
      ...config,
      language,
      rollover_hours: rolloverHours,
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

  /**
   * Parse "HH:MM" into [hours, minutes]; returns null if unparseable.
   */
  _parseTime(value) {
    if (typeof value !== "string") return null;
    const m = value.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return [h, min];
  }

  /**
   * Decide whether to show today or tomorrow.
   * Returns { key: "today"|"tomorrow", rolloverAt: Date|null }.
   * rolloverAt is the moment the card should next re-evaluate (today's
   * threshold), or null when there's nothing further to schedule.
   */
  _selectDay(todayObj) {
    // Without a tomorrow entity, always show today — no roll-over.
    if (!this._config.tomorrow_entity) {
      return { key: "today", rolloverAt: null };
    }
    const time = this._parseTime(todayObj?.attributes?.collection_time);
    // If we can't read a collection time, fail safe to showing today.
    if (!time) {
      return { key: "today", rolloverAt: null };
    }
    const now = new Date();
    const threshold = new Date(now);
    threshold.setHours(time[0], time[1], 0, 0);
    threshold.setTime(
      threshold.getTime() + this._config.rollover_hours * 3600 * 1000
    );
    if (now >= threshold) {
      return { key: "tomorrow", rolloverAt: null };
    }
    return { key: "today", rolloverAt: threshold };
  }

  _clearTimer() {
    if (this._rolloverTimer) {
      clearTimeout(this._rolloverTimer);
      this._rolloverTimer = null;
    }
  }

  _scheduleRollover(rolloverAt) {
    this._clearTimer();
    if (!rolloverAt) return;
    const ms = rolloverAt.getTime() - Date.now();
    if (ms <= 0) return;
    // Cap the timer so we re-render at least daily even if the threshold is far.
    const delay = Math.min(ms, 6 * 3600 * 1000);
    this._rolloverTimer = setTimeout(() => this._render(), delay + 1000);
  }

  disconnectedCallback() {
    this._clearTimer();
  }

  _render() {
    if (!this._hass || !this._config) return;
    const todayObj = this._hass.states[this._config.entity];
    if (!todayObj) {
      this.innerHTML = `<ha-card><div class="mw-missing">Entity not found: ${this._config.entity}</div></ha-card>`;
      this._injectStyle();
      return;
    }

    const { key, rolloverAt } = this._selectDay(todayObj);
    this._scheduleRollover(rolloverAt);

    const showingTomorrow = key === "tomorrow";
    const stateObj = showingTomorrow
      ? this._hass.states[this._config.tomorrow_entity]
      : todayObj;

    // If tomorrow was selected but its entity is missing, fall back to today.
    const effective = stateObj ?? todayObj;

    const streams = effective.attributes.streams ?? ["none"];
    const dateStr = effective.attributes.date;
    const locale = this._config.language === "mt" ? "mt-MT" : undefined;
    let dateLabel = "";
    if (this._config.show_date && dateStr) {
      dateLabel = new Date(dateStr).toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }

    const heading = showingTomorrow
      ? TOMORROW_HEADING[this._config.language] ?? TOMORROW_HEADING.en
      : this._config.title;

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
            <span class="mw-title">${heading}</span>
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
