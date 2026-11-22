// Rendering logic for the football schedule page (2026-game-schedules.html,
// pasted into SportsEngine's page editor as a "Code" element). Lives here
// instead of inline in that pasted HTML so the actual content SportsEngine
// has to accept on save stays small - the pasted page is just markup plus
// a single <script src> tag pointing at this file (same externalization
// already used for football.css and the background/icon images). Edit
// this file + push to update the page's behavior; no re-paste into
// SportsEngine needed unless the HTML markup itself changes.
//
// scripts/preview/schedule-preview.html (lcc_sportsengine repo) keeps its
// own "exact port" copy of buildRow()/drawChampOpp()/etc for its offline,
// no-server preview use case - mirror any change here into that file too.
(function () {
  // Schedule data is fetched at runtime from the automated publish
  // pipeline (see lcc_sportsengine repo) instead of being hardcoded here.
  const SCHEDULE_URL = "https://lighthouse-christian-chargers-football.github.io/lcc-se-public/data/schedules.json";

  let schedules = { varsity: [], jv: [], jh: [] };
  let records = { varsity: null, jv: null, jh: null };

  // v ?? "" (not v || "") - a real score of 0 is falsy but not "missing";
  // `||` was silently turning a 0-0 or 0-20 result into a blank/"-20"
  // (visitor_score/home_score of 0 disappearing from the result text).
  function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function normalized(v) { return String(v || "").trim().toUpperCase(); }
  function isEmphasized(v) { const t = normalized(v); return t === "TBD" || t === "BYE WEEK" || t === "NO GAME"; }

  function classesFor(v, c) { return isEmphasized(v) ? c + " chargers-tbd" : c; }
  function siteClasses(s) { return normalized(s) === "HOME" ? "chargers-col-site chargers-home" : "chargers-col-site"; }

  // Milestone callout icons (schedule_overrides.yaml's `milestones`
  // section - see schedule_builder.py). Colors are baked directly into
  // each path/circle's own `fill` attribute rather than a CSS class,
  // because drawChampOpp() below re-rasterizes this exact same markup
  // as a standalone data: URI image for the flattened share/download
  // image - that image never loads this page's stylesheet, so a
  // CSS-driven fill would render correctly live but black (or invisible)
  // in the exported JPEG. The "chargers-trophy-icon" class is only for
  // sizing (width/height, in football.css), which both contexts handle
  // on their own: the DOM via the class, the canvas via drawImage()'s
  // explicit width/height. xmlns is required for the data: URI image
  // below to decode at all (it's parsed as a standalone XML document,
  // unlike innerHTML injection into the live page, which doesn't need
  // it) - confirmed by testing: the same markup without it silently
  // never resolves (no console error, img.onerror just fires).
  // Trophy cup path - note the right-side handle is NOT a plain mirror
  // of the left one's coordinates: reflecting a path's points also
  // reverses how it "winds" on screen, and fill-rule:nonzero decides a
  // handle's hole-vs-solid look by that winding direction relative to
  // the cup body. A naive coordinate mirror made the right handle render
  // fully solid (no hole) even though its points were geometrically
  // correct - caught by flipping the rendered icon and diffing it
  // against itself (should be all-black/identical if truly symmetric;
  // it wasn't, right at the handle). Fixed by also reversing the point
  // ORDER for the right handle, not just mirroring coordinates - verify
  // again the same way if this path is ever touched.
  const TROPHY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" class="chargers-trophy-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#c9972c" d="M7 4h10v2h3a1 1 0 0 1 1 1v1c0 2.21-1.79 4-4 4h-.26A6.01 6.01 0 0 1 13 15.9V18h3v2H8v-2h3v-2.1A6.01 6.01 0 0 1 7.26 12H7c-2.21 0-4-1.79-4-4V7a1 1 0 0 1 1-1h3V4zM5 8c0 1.1.9 2 2 2V7H5v1zM19 8L19 7L17 7L17 10C18.1 10 19 9.1 19 8Z"/></svg>';
  // Same cup shape as TROPHY_SVG, silver instead of gold - used for a
  // notable result that isn't an outright win (schedule_overrides.yaml's
  // icon: "silver-trophy", e.g. a runner-up finish).
  const SILVER_TROPHY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" class="chargers-trophy-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#9aa3b2" d="M7 4h10v2h3a1 1 0 0 1 1 1v1c0 2.21-1.79 4-4 4h-.26A6.01 6.01 0 0 1 13 15.9V18h3v2H8v-2h3v-2.1A6.01 6.01 0 0 1 7.26 12H7c-2.21 0-4-1.79-4-4V7a1 1 0 0 1 1-1h3V4zM5 8c0 1.1.9 2 2 2V7H5v1zM19 8L19 7L17 7L17 10C18.1 10 19 9.1 19 8Z"/></svg>';
  // The real NHFA trophy photo (schedule_overrides.yaml's icon:
  // "nhfa-trophy"), reserved for an actual national-championship-level
  // result - year-agnostic (the photo itself has no text/date on it; the
  // year/result comes from the row's own caption). Same ?v= cache-busting
  // convention as the background images - bump it if this file is ever
  // replaced.
  const NHFA_TROPHY_URL = "https://lighthouse-christian-chargers-football.github.io/lcc-se-public/img/milestone-nhfa-trophy.png?v=1";

  // icon is optional (schedule_overrides.yaml) - a milestone can be
  // caption-only, e.g. a semifinal-advancement note that isn't itself a
  // trophy/medal-worthy result. Empty string means "no icon", not an
  // error; buildRow() below only renders the icon-wrap span when this
  // returns something.
  function milestoneIconMarkup(icon) {
    const i = normalized(icon);
    if (i === "SILVER-TROPHY") return SILVER_TROPHY_SVG;
    if (i === "NHFA-TROPHY") {
      return `<img class="chargers-nhfa-trophy-icon" src="${NHFA_TROPHY_URL}" alt="">`;
    }
    if (i === "TROPHY") return TROPHY_SVG;
    return "";
  }
  function milestoneTextClass(icon) { return normalized(icon) === "SILVER-TROPHY" ? "chargers-champ-text-silver" : "chargers-champ-text-gold"; }

  // Result text for a final game, shown in place of the time column -
  // e.g. site "Away", { visitor_score: 14, home_score: 42, outcome: "W" }
  // -> "W 14-42" (Chargers were the visitor, so their own 14 leads).
  // Same game as the home team instead ({ visitor_score: 42,
  // home_score: 14 }, site "Home") would print identically, "W 14-42" -
  // Chargers' own score always shown first, opponent's second,
  // regardless of which side of visitor/home they actually were.
  // g.result is only ever non-null when schedule_builder.py has both a
  // real score AND a start time in the past for this game (see its
  // transform_game() docs) - never trust status/score presence alone
  // here either, so a bad/partial data row just falls through to the
  // normal time cell below instead of guessing.
  //
  // A separate, unrelated case: { outcome: "COMPLETED" } with no scores -
  // for a manual_overrides event with no real winner (a jamboree, a
  // 7-on-7) once its date has passed (see schedule_overrides.yaml's
  // completed_when_past). Shown as plain "Completed" text, no score.
  function resultCell(g) {
    const r = g.result;
    if (!r) return null;
    if (r.outcome === "COMPLETED") {
      return `<span class="chargers-col-time chargers-result-completed">Completed</span>`;
    }
    if (r.visitor_score == null || r.home_score == null || !r.outcome) return null;
    const cls = r.outcome === "W" ? "chargers-result-win"
      : r.outcome === "L" ? "chargers-result-loss"
      : "chargers-result-tie";
    // Chargers' own score always shown first, opponent's second -
    // regardless of who was actually the home/visitor team that game.
    // The published data only has visitor_score/home_score (from
    // SportsEngine's own event structure), but g.site ("Home"/"Away",
    // already resolved per-game) tells us which of those two is ours.
    const weAreHome = normalized(g.site) === "HOME";
    const chargerScore = weAreHome ? r.home_score : r.visitor_score;
    const opponentScore = weAreHome ? r.visitor_score : r.home_score;
    return `<span class="chargers-col-time ${cls}">${escapeHtml(r.outcome)} ${escapeHtml(chargerScore)}-${escapeHtml(opponentScore)}</span>`;
  }

  // "Canceled" / "Postponed" / "Delayed" from SportsEngine (schedule_builder.py's
  // game_status_label()), shown in place of the time - red for postponed,
  // amber for delayed. Never set on a game that already has a result.
  function statusCell(g) {
    const st = normalized(g.status);
    if (st === "CANCELED") return `<span class="chargers-col-time chargers-status-canceled">Canceled</span>`;
    if (st === "POSTPONED") return `<span class="chargers-col-time chargers-status-postponed">Postponed</span>`;
    if (st === "DELAYED") return `<span class="chargers-col-time chargers-status-delayed">Delayed</span>`;
    return null;
  }

  function buildRow(g) {
    const timeCell = resultCell(g) || statusCell(g) ||
      `<span class="${classesFor(g.time, "chargers-col-time")}">${escapeHtml(g.time)}</span>`;
    const m = g.milestone;
    // A milestone row (schedule_overrides.yaml) replaces the plain
    // opponent cell with an icon + wrapped name + caption - see
    // football.css's "Milestone callout row" block for the layout this
    // markup depends on. Never derived from the game's own W/L/T result;
    // purely whatever the YAML says.
    const iconMarkup = m ? milestoneIconMarkup(m.icon) : "";
    // No icon -> the text-wrap fills the whole opponent column on its
    // own, so it's centered instead of left-aligned (see football.css) -
    // left-align only makes sense floating beside an icon.
    const textWrapClass = `chargers-champ-text-wrap ${milestoneTextClass(m && m.icon)}${iconMarkup ? "" : " chargers-champ-text-centered"}`;
    const oppCell = m
      ? `<span class="chargers-col-opp chargers-champ-opp">
          ${iconMarkup ? `<span class="chargers-champ-icon-wrap">${iconMarkup}</span>` : ""}
          <span class="${textWrapClass}">${escapeHtml(g.opponent)}<span class="chargers-champ-caption">${escapeHtml(m.caption)}</span></span>
        </span>`
      : `<span class="${classesFor(g.opponent, "chargers-col-opp")}">${escapeHtml(g.opponent)}</span>`;
    const rowClasses = m ? " chargers-champ-row" + (m.prominent ? " chargers-champ-prominent" : "") : "";
    return `<div class="chargers-schedule-row${rowClasses}">
      <span class="${classesFor(g.date, "chargers-col-date")}">${escapeHtml(g.date)}</span>
      ${oppCell}
      <span class="${siteClasses(g.site)}">${escapeHtml(g.site)}</span>
      ${timeCell}
      <span class="${classesFor(g.location, "chargers-col-loc")}">${escapeHtml(g.location)}</span>
    </div>`;
  }

  // One row per team marks where its postseason_cutoff (schedule_overrides.yaml)
  // falls - schedule_builder.py already flags every row past it with
  // postseason: true, so this just finds the first one per team and
  // inserts a divider there, rather than re-deriving any date logic here.
  function buildDivider() {
    return `<div class="chargers-schedule-divider"><span class="chargers-schedule-divider-label">Postseason</span></div>`;
  }

  function buildTeamRows(games) {
    const html = [];
    let dividerShown = false;
    (games || []).forEach(function (g) {
      if (g.postseason && !dividerShown) {
        html.push(buildDivider());
        dividerShown = true;
      }
      html.push(buildRow(g));
    });
    return html.join("");
  }

  // Update this once per season - schedule dates in the JSON have no year.
  const SEASON_YEAR = 2026;
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

  function parseGameDate(dateStr) {
    const m = String(dateStr || "").trim().match(/^([A-Za-z]+)\s+(\d{1,2})/);
    if (!m) return null;
    const month = MONTHS[m[1].toLowerCase()];
    const day = parseInt(m[2], 10);
    if (month === undefined || !day) return null;
    return new Date(SEASON_YEAR, month, day);
  }

  function findNextHomeGame(sched) {
    const teamLabels = { varsity: "Varsity", jv: "Junior Varsity", jh: "Junior High" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let best = null;
    Object.keys(teamLabels).forEach(function (team) {
      (sched[team] || []).forEach(function (g) {
        if (normalized(g.site) !== "HOME") return;
        // don't sell tickets to a canceled or postponed game
        if (normalized(g.status) === "POSTPONED" || normalized(g.status) === "CANCELED") return;
        const d = parseGameDate(g.date);
        if (!d || d < today) return;
        if (!best || d < best.dateObj) {
          best = Object.assign({ dateObj: d, teamLabel: teamLabels[team] }, g);
        }
      });
    });
    return best;
  }

  function updateTicketBanner(sched) {
    const banner = document.getElementById("chargers-ticket-banner");
    if (!banner) return;
    const next = findNextHomeGame(sched);
    if (!next) {
      banner.style.display = "none";
      return;
    }
    document.getElementById("ticket-team").textContent = next.teamLabel;
    document.getElementById("ticket-opponent").textContent = next.opponent;
    document.getElementById("ticket-date").textContent = next.date;
    document.getElementById("ticket-time").textContent =
      normalized(next.status) === "DELAYED" ? "Delayed" : next.time;
    document.getElementById("ticket-location").textContent = next.location;
    banner.style.display = "block";
  }

  // "3-1" normally, "3-1-1" only if there's a tie to report - a team
  // with no games played/finished yet (0-0) still shows "0-0" rather
  // than hiding the overlay, so the placement is visible for review
  // even before the season has any results.
  function formatRecord(r) {
    if (!r) return "";
    const base = `${r.wins}-${r.losses}`;
    return r.ties ? `${base}-${r.ties}` : base;
  }

  // Shrinks .chargers-record-overlay's font-size (never grows past the
  // CSS clamp()'s own size) until its text fits on one line. A wrapped
  // two-line record (e.g. a tie record like "5-3-1" plus the flanking
  // ornament lines, at some viewport widths) is never acceptable here -
  // shrinking to fit replaces wrapping entirely, down to half the
  // clamp's resolved size before giving up and letting it overflow
  // instead (an edge case distant enough not to be worth a user-visible
  // minimum-size warning).
  function fitRecordText(recordEl) {
    const textEl = recordEl.querySelector('.chargers-record-text');
    if (!textEl) return;
    // The per-team class (.chargers-record-varsity etc.) sets font-size
    // with !important, which beats a plain inline style - setProperty's
    // "important" priority is required here, or this whole function
    // silently has no visual effect while still reporting a (wrong)
    // shrunk value to getComputedStyle callers.
    recordEl.style.removeProperty("font-size");
    const maxFontSize = parseFloat(window.getComputedStyle(recordEl).fontSize);
    if (!maxFontSize) return;
    let fontSize = maxFontSize;
    const minFontSize = maxFontSize * 0.5;
    while (recordEl.scrollWidth > recordEl.clientWidth + 0.5 && fontSize > minFontSize) {
      fontSize -= 1;
      recordEl.style.setProperty("font-size", fontSize + "px", "important");
    }
  }

  function renderRecords() {
    Object.keys(records).forEach(team => {
      const el = document.getElementById(team + "-record");
      if (!el) return;
      el.innerHTML = `<span class="chargers-record-text">${escapeHtml(formatRecord(records[team]))}</span>`;
      fitRecordText(el);
    });
    // The fit above may have measured against a fallback font if the
    // "Bungee" webfont hadn't finished loading yet (same concern
    // flattenCard() already handles for the canvas/share-image path) -
    // re-check once it's actually in.
    document.fonts.ready.then(function () {
      Object.keys(records).forEach(team => {
        const el = document.getElementById(team + "-record");
        if (el) fitRecordText(el);
      });
    });
  }

  function renderSchedules() {
    Object.keys(schedules).forEach(team => {
      const container = document.getElementById(team + "-schedule");
      if (container) container.innerHTML = buildTeamRows(schedules[team]);
    });
    renderRecords();
    // Once the live text overlay is in the DOM (needed for layout
    // measurements), flatten each card into a single downloadable image.
    document.querySelectorAll('.chargers-card').forEach(flattenCard);
  }

  // Shown in place of a schedule if the published JSON can't be fetched
  // or parsed - keeps the page from silently showing empty schedule cards.
  function showLoadError() {
    Object.keys(schedules).forEach(team => {
      const container = document.getElementById(team + "-schedule");
      if (container) {
        container.innerHTML =
          '<div class="chargers-schedule-row">' +
          '<span class="chargers-col-opp">Schedule temporarily unavailable - please check back soon.</span>' +
          '</div>';
      }
    });
  }

  async function loadSchedules() {
    try {
      // Cache-bust both the browser and the GitHub Pages CDN, since the
      // publish pipeline can update this file at any time and schedule
      // data going stale for several minutes isn't acceptable here.
      const response = await fetch(`${SCHEDULE_URL}?_=${Date.now()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      schedules = {
        varsity: Array.isArray(data.varsity) ? data.varsity : [],
        jv: Array.isArray(data.jv) ? data.jv : [],
        jh: Array.isArray(data.jh) ? data.jh : [],
      };
      records = {
        varsity: (data.records || {}).varsity || null,
        jv: (data.records || {}).jv || null,
        jh: (data.records || {}).jh || null,
      };

      renderSchedules();
      updateTicketBanner(schedules);
    } catch (err) {
      console.error("Failed to load schedule data:", err);
      showLoadError();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSchedules);
  } else {
    loadSchedules();
  }

  // Preloads the trophy/medal SVGs as real Image objects (via a data:
  // URI, not a <img crossorigin> fetch - there's nothing cross-origin
  // about inline markup) so drawChampOpp() below can drawImage() them
  // synchronously once this resolves. Memoized: every card's flattenCard()
  // call shares the same one load instead of re-decoding the SVGs per card.
  function loadIconImage(svg) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      // Never block the whole share-image export over one icon failing
      // to decode - drawChampOpp() just skips the icon if this is null.
      img.onerror = function () { resolve(null); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  // Same idea as loadIconImage() above, but for a real cross-origin image
  // (the NHFA trophy photo) rather than inline SVG markup - needs
  // crossOrigin set BEFORE src, same reason the background <img> tags use
  // crossorigin="anonymous": without it, drawImage()-ing this into the
  // export canvas would taint it and silently break the whole share/save
  // image, not just this one icon.
  function loadRealImage(url) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  let iconImagesPromise = null;
  function getIconImages() {
    if (!iconImagesPromise) {
      iconImagesPromise = Promise.all([
        loadIconImage(TROPHY_SVG),
        loadIconImage(SILVER_TROPHY_SVG),
        loadRealImage(NHFA_TROPHY_URL),
      ]).then(function (imgs) {
        return { trophy: imgs[0], silverTrophy: imgs[1], nhfaTrophy: imgs[2] };
      });
    }
    return iconImagesPromise;
  }

  // Reads back the REAL visual line breaks the browser already chose for
  // one text node, as [{text, top}, ...] (top in viewport CSS px) - by
  // walking it character-by-character with a Range and grouping runs
  // that share the same vertical position. Used instead of re-estimating
  // the wrap with canvas font metrics (e.g. a greedy ctx.measureText
  // word-wrap): that approach was tried first and quietly disagreed with
  // the real CSS layout (different width assumptions for "bold Arial"
  // than whatever the live page actually rendered), wrapping a name here
  // that the live page kept on one line, which then overran into the row
  // below it - caught by comparing a live-DOM screenshot against the
  // flattened/canvas one side by side, not by inspecting either alone.
  // Reading the real rects instead guarantees an exact match by
  // construction, line count and position both, and also means
  // CSS's text-transform: uppercase (visual only - textContent itself
  // stays whatever case was typed) can never cause a mismatched wrap
  // either, since the rects reflect the actually-rendered glyphs.
  function getWrappedLines(node) {
    const text = (node && node.textContent) || "";
    if (!text) return [];
    const range = document.createRange();
    const lines = [];
    let lineStart = 0;
    let lastTop = null;
    for (let i = 1; i <= text.length; i++) {
      range.setStart(node, i - 1);
      range.setEnd(node, i);
      const rects = range.getClientRects();
      const rect = rects[rects.length - 1];
      if (!rect) continue;
      if (lastTop === null) {
        lastTop = rect.top;
      } else if (Math.abs(rect.top - lastTop) > 1) {
        lines.push({ text: text.slice(lineStart, i - 1), top: lastTop });
        lineStart = i - 1;
        lastTop = rect.top;
      }
    }
    if (lineStart < text.length || lines.length === 0) {
      lines.push({ text: text.slice(lineStart), top: lastTop });
    }
    return lines
      .map(function (l) { return { text: l.text.trim(), top: l.top }; })
      .filter(function (l) { return l.text.length > 0; });
  }

  // Redraws one milestone callout cell (icon + wrapped opponent name +
  // caption) for the flattened/shareable image - canvas can't rasterize
  // a live DOM subtree (the injected SVG, the flex-wrapped text) on its
  // own, so this reads the already-laid-out geometry/styles straight off
  // the real elements and reproduces them by hand, the same approach
  // already used below for the record ornament and postseason divider.
  function drawChampOpp(ctx, span, pBox, sX, sY, iconImages) {
    const iconWrap = span.querySelector('.chargers-champ-icon-wrap');
    const textWrap = span.querySelector('.chargers-champ-text-wrap');
    if (!textWrap) return;
    const captionEl = textWrap.querySelector('.chargers-champ-caption');

    ctx.save();

    if (iconWrap && iconImages) {
      // Read which icon is actually present straight off the live DOM
      // (rather than re-inferring it from the text color class), so this
      // never drifts from whatever milestoneIconMarkup() rendered.
      let iconImg;
      if (iconWrap.querySelector('.chargers-nhfa-trophy-icon')) {
        iconImg = iconImages.nhfaTrophy;
      } else if (textWrap.classList.contains('chargers-champ-text-silver')) {
        iconImg = iconImages.silverTrophy;
      } else {
        iconImg = iconImages.trophy;
      }
      if (iconImg) {
        const iconBox = iconWrap.getBoundingClientRect();
        if (iconBox.width > 0 && iconBox.height > 0) {
          ctx.drawImage(
            iconImg,
            (iconBox.left - pBox.left) * sX,
            (iconBox.top - pBox.top) * sY,
            iconBox.width * sX,
            iconBox.height * sY
          );
        }
      }
    }

    const textBox = textWrap.getBoundingClientRect();
    const textStyle = window.getComputedStyle(textWrap);
    const nameFontSz = parseFloat(textStyle.fontSize) || 14;
    // No icon -> text-wrap is centered (football.css's
    // ".chargers-champ-text-centered"), not left-aligned - mirror
    // whichever this row actually uses, or the exported image's text
    // would sit flush against the date column even though the live page
    // doesn't (the original reason this centered mode exists: a long
    // opponent name touching the date text at narrow widths).
    const centered = textWrap.classList.contains('chargers-champ-text-centered');
    const drawX = centered
      ? (textBox.left + textBox.width / 2 - pBox.left) * sX
      : (textBox.left - pBox.left) * sX;

    ctx.textAlign = centered ? "center" : "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = textStyle.color;

    // The opponent name is textWrap's own first child - a plain text
    // node (escapeHtml never introduces a nested element), with the
    // caption <span> as its only sibling after it.
    ctx.font = `bold ${nameFontSz * sX}px Arial, Helvetica, sans-serif`;
    getWrappedLines(textWrap.childNodes[0]).forEach(function (line) {
      ctx.fillText(line.text, drawX, (line.top - pBox.top) * sY);
    });

    if (captionEl) {
      const captionStyle = window.getComputedStyle(captionEl);
      const capFontSz = parseFloat(captionStyle.fontSize) || nameFontSz * 0.68;
      ctx.font = `bold ${capFontSz * sX}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = captionStyle.color;
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${0.05 * capFontSz * sX}px`;
      getWrappedLines(captionEl.childNodes[0]).forEach(function (line) {
        // text-transform: uppercase is visual only - textContent stays
        // whatever case the YAML caption was typed in.
        ctx.fillText(line.text.toUpperCase(), drawX, (line.top - pBox.top) * sY);
      });
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }

    ctx.restore();
  }

  // Draws the background image + schedule text onto a canvas, matching
  // exactly what's on screen, and returns the canvas via callback.
  function drawScheduleCanvas(container, img, iconImages, callback) {
    const overlay = container.querySelector('.chargers-overlay');
    if (!overlay) return callback(null);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = 2;

    canvas.width = (img.naturalWidth || img.width || 900) * scale;
    canvas.height = (img.naturalHeight || img.height || 600) * scale;

    try {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const pBox = container.getBoundingClientRect();
      const sX = canvas.width / pBox.width;
      const sY = canvas.height / pBox.height;

      const overlayStyles = window.getComputedStyle(overlay);
      const fontSz = parseFloat(overlayStyles.fontSize) || 14;

      ctx.textBaseline = "top";
      ctx.textAlign = "center";

      // Reads the actual --lcc-navy custom property rather than
      // hardcoding a hex value, so this can't drift from football.css
      // the way a copy-pasted color literal could. Used by the record
      // ornament below and by the postseason divider further down.
      const navyVar = getComputedStyle(document.documentElement).getPropertyValue('--lcc-navy').trim() || "#0b2b4a";

      // Win-loss record, if this card has one - drawn separately from
      // the schedule grid below since it's positioned over the photo,
      // not the grid. Relies on the "Bungee" webfont already being
      // loaded (flattenCard() awaits document.fonts.ready before
      // calling this) - without that, canvas would silently fall back
      // to the generic sans-serif with no error.
      const recordEl = container.querySelector('.chargers-record-overlay');
      if (recordEl && recordEl.textContent.trim()) {
        // recordBox is .chargers-record-overlay's OWN box, which spans
        // the full card width (it's positioned with left:0/right:0) -
        // NOT the tighter visual bounds of its centered flex content.
        // getBoundingClientRect() can't be used to find where the text
        // or the flanking lines actually land on screen; centerX/topY
        // below only use it for what it's still valid for (the row's
        // horizontal center and vertical top, both true regardless of
        // the container's own width).
        const recordBox = recordEl.getBoundingClientRect();
        const recordStyle = window.getComputedStyle(recordEl);
        const recordFontSz = parseFloat(recordStyle.fontSize) || 40;
        const centerX = (recordBox.left + recordBox.width / 2 - pBox.left) * sX;
        const topY = (recordBox.top - pBox.top) * sY;

        ctx.save();
        ctx.font = `${recordFontSz * sX}px "Bungee", Arial, Helvetica, sans-serif`;
        // Matches the CSS's letter-spacing: 0.05em so measureText below
        // (and the fillText/strokeText calls) reflect the same width as
        // the live DOM text - canvas ignores CSS letter-spacing otherwise.
        if ("letterSpacing" in ctx) ctx.letterSpacing = `${0.05 * recordFontSz * sX}px`;
        // Real rendered text width, straight from canvas's own text
        // shaping - this is what actually places the flanking lines
        // relative to the text below (measuring recordBox for this
        // would silently reuse the full-card width from above).
        const textWidthPx = ctx.measureText(recordEl.textContent).width;

        // Thin white inner edge + thicker navy outer edge, for contrast
        // against the photo regardless of what's directly behind the
        // text - the real version of football.css's 12-point shadow-ring
        // approximation (canvas draws true circular strokes, so this is
        // cleaner than what CSS alone can do). strokeText straddles the
        // glyph path itself (half the lineWidth inside, half outside),
        // so each lineWidth is set to 2x its target outward radius - the
        // inward half gets covered by the next stroke/fill drawn after
        // it. Keep both radii (0.025em white / 0.075em navy) in sync
        // with football.css's ring if you change either.
        ctx.lineJoin = "round";
        ctx.strokeStyle = navyVar;
        ctx.lineWidth = 2 * 0.075 * recordFontSz * sX;
        ctx.strokeText(recordEl.textContent, centerX, topY);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 * 0.025 * recordFontSz * sX;
        ctx.strokeText(recordEl.textContent, centerX, topY);
        ctx.fillStyle = recordStyle.color; // resolves var(--lcc-orange) to a real color
        ctx.fillText(recordEl.textContent, centerX, topY);
        ctx.restore();

        // Flanking double-line ornament (the ::before/::after in
        // .chargers-record-overlay, football.css) - canvas can't render
        // pseudo-element boxes on its own, so it's redrawn here from the
        // same em-relative geometry as the CSS. Keep LINE_W_EM/
        // LINE_THICK_EM/LINE_BLOCK_H_EM/LINE_GAP_EM in sync with
        // football.css's version (LINE_GAP_EM mirrors its flex `gap`)
        // if any change. The flex row centers these lines on the text
        // via `align-items: center`, which canvas has no equivalent for
        // - 0.66 stands in for that: Bungee's real ascent+descent
        // (1.02 + 0.30 font-size units), halved, i.e. the vertical
        // center of the text's own line box. Recompute both if the
        // font ever changes.
        const LINE_W_EM = 1.9, LINE_THICK_EM = 0.043, LINE_BLOCK_H_EM = 0.258, LINE_GAP_EM = 0.45;
        const lineWpx = LINE_W_EM * recordFontSz * sX;
        const lineThickPx = LINE_THICK_EM * recordFontSz * sY;
        const lineGapPx = LINE_GAP_EM * recordFontSz * sX;
        const lineBlockCenterY = topY + 0.66 * recordFontSz * sY;
        const lineTopY = lineBlockCenterY - (LINE_BLOCK_H_EM / 2) * recordFontSz * sY;
        const lineBottomY = lineBlockCenterY + (LINE_BLOCK_H_EM / 2) * recordFontSz * sY - lineThickPx;
        const leftLineX = centerX - textWidthPx / 2 - lineGapPx - lineWpx;
        const rightLineX = centerX + textWidthPx / 2 + lineGapPx;

        ctx.fillStyle = navyVar; // same --lcc-navy read further up, for the outline stroke
        [leftLineX, rightLineX].forEach(function (x) {
          ctx.fillRect(x, lineTopY, lineWpx, lineThickPx);
          ctx.fillRect(x, lineBottomY, lineWpx, lineThickPx);
        });
      }

      overlay.querySelectorAll('.chargers-schedule-row').forEach(row => {
        // :scope > span (not the old bare 'span') - a champ row's own
        // nested icon/text/caption spans live inside its opponent cell
        // (.chargers-champ-opp), and would otherwise show up here as
        // extra "cells" alongside the real 5. This still returns
        // exactly the same 5 top-level cells as before for every row,
        // champ or not.
        const spans = row.querySelectorAll(':scope > span');
        if (spans.length < 5) return;

        const rowBox = row.getBoundingClientRect();
        const rowTop = (rowBox.top - pBox.top) * sY;

        spans.forEach(span => {
          if (span.classList.contains('chargers-champ-opp')) {
            drawChampOpp(ctx, span, pBox, sX, sY, iconImages);
            return;
          }
          const spanBox = span.getBoundingClientRect();
          const centerX = (spanBox.left + spanBox.width / 2 - pBox.left) * sX;
          const spanStyle = window.getComputedStyle(span);
          const isItalic = spanStyle.fontStyle === "italic";
          ctx.font = (isItalic ? "italic bold " : "bold ") + (fontSz * sX) + "px Arial, Helvetica, sans-serif";
          // Each cell's own computed color, not a single color for the
          // whole row - a row can mix a plain navy date/opponent, an
          // orange "Home" site, AND a green/red/gray result, and each
          // needs its own real color. (Previously this set one
          // isHome-derived fillStyle for the whole row, which silently
          // painted every cell in a Home row orange, including a W/L
          // result that should have been green/red - only visible once
          // this canvas output was actually screenshotted rather than
          // just eyeballing the live CSS overlay.)
          ctx.fillStyle = spanStyle.color;
          ctx.fillText(span.innerText, centerX, rowTop);
        });
      });

      // Postseason divider (.chargers-schedule-divider, from buildDivider()
      // above) - canvas can't see the CSS ::before/::after flanking lines,
      // so this redraws the same line+label directly, the same general
      // idea as the record ornament above but deliberately simpler (one
      // line color, no white/navy double-stroke ring) since this is a
      // small in-page marker, not a brand asset.
      overlay.querySelectorAll('.chargers-schedule-divider').forEach(div => {
        const label = div.querySelector('.chargers-schedule-divider-label');
        if (!label) return;

        const divBox = div.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        const labelStyle = window.getComputedStyle(label);
        const labelFontSz = parseFloat(labelStyle.fontSize) || fontSz;

        const rowLeftX = (divBox.left - pBox.left) * sX;
        const rowRightX = (divBox.left + divBox.width - pBox.left) * sX;
        const labelLeftX = (labelBox.left - pBox.left) * sX;
        const labelRightX = (labelBox.left + labelBox.width - pBox.left) * sX;
        const topY = (divBox.top - pBox.top) * sY;
        // Approximate vertical center of the label's own line box (no
        // need for the record ornament's precise font-metric derivation -
        // this is a thin in-page rule, not a photographed brand asset).
        const lineCenterY = topY + labelFontSz * sY * 0.58;
        const lineThickPx = Math.max(1, 1 * sY);

        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = navyVar;
        ctx.fillRect(rowLeftX, lineCenterY - lineThickPx / 2, Math.max(0, labelLeftX - rowLeftX), lineThickPx);
        ctx.fillRect(labelRightX, lineCenterY - lineThickPx / 2, Math.max(0, rowRightX - labelRightX), lineThickPx);
        ctx.restore();

        ctx.font = `bold ${labelFontSz * sX}px Arial, Helvetica, sans-serif`;
        ctx.fillStyle = labelStyle.color; // resolves var(--lcc-orange) to a real color
        ctx.fillText(label.textContent, (labelBox.left + labelBox.width / 2 - pBox.left) * sX, topY);
      });

      callback(canvas);
    } catch (securityError) {
      console.error("Canvas draw failed (likely a CORS issue with the image host):", securityError);
      callback(null);
    }
  }

  // Composites one card's background + schedule text into a single image,
  // then swaps the visible <img> to that flattened graphic so a plain
  // long-press (mobile) or right-click (desktop) saves/shares it directly -
  // no click-triggered generation, no download-attribute workarounds needed.
  function flattenCard(container) {
    const img = container.querySelector('img');
    if (!img) return;

    const run = async function () {
      // The record overlay uses the "Bungee" webfont - canvas text
      // drawing doesn't wait for webfonts on its own (it just silently
      // falls back to a default font instead of erroring), so wait
      // explicitly before drawScheduleCanvas measures/draws anything.
      try {
        await document.fonts.ready;
      } catch (e) {
        // Font Loading API unavailable/failed - proceed anyway; worst
        // case the shared image's record text falls back to a generic
        // sans-serif rather than not exporting at all.
      }
      const iconImages = await getIconImages();
      drawScheduleCanvas(container, img, iconImages, function (canvas) {
        if (!canvas) return; // leave the original live overlay visible as a fallback
        canvas.toBlob(function (blob) {
          if (!blob) return;
          const blobUrl = URL.createObjectURL(blob);
          const filename = container.dataset.filename || (container.id + '-schedule.jpeg');

          // Keep the blob/filename around for the button's instant share/download.
          container._flattenedBlob = blob;
          container._flattenedFilename = filename;

          // Replace the two-layer (background img + text overlay) display
          // with the single flattened image - this is now a real, normal
          // <img> that supports native save/share gestures everywhere.
          const flatImg = document.createElement('img');
          flatImg.src = blobUrl;
          flatImg.alt = img.alt;
          flatImg.style.display = 'block';
          flatImg.style.width = '100%';
          flatImg.style.height = 'auto';
          container.innerHTML = '';
          container.appendChild(flatImg);
        }, "image/jpeg", 0.95);
      });
    };

    if (img.complete && img.naturalWidth > 0) {
      run();
    } else {
      img.addEventListener('load', run, { once: true });
      img.addEventListener('error', function () {
        console.error("Background image failed to load:", img.src);
      }, { once: true });
    }
  }
}());

// Global execution mapping for the HTML button inline clicks.
// By the time a user can click this, flattenCard() has usually already
// finished, so this is normally an instant share/download of the
// already-generated image rather than a fresh generation.
function printScheduleCard(targetId, evt) {
  const container = document.getElementById(targetId);
  const clickButton = evt ? evt.currentTarget : null;
  if (!container) return;

  const originalText = clickButton ? clickButton.innerText : "Share / Save Schedule";

  if (container._flattenedBlob) {
    saveOrShareImage(container._flattenedBlob, container._flattenedFilename, clickButton, originalText);
    return;
  }

  // Fallback: flattening hasn't finished yet (e.g. clicked immediately on
  // page load, or the image is still loading) - generate it now instead.
  if (clickButton) clickButton.innerText = "Preparing...";
  const flatImg = container.querySelector('img');
  if (!flatImg) return;

  const tryGenerate = function () {
    const overlay = container.querySelector('.chargers-overlay');
    if (!overlay) {
      // Already flattened between the click and now - just re-run.
      if (container._flattenedBlob) {
        saveOrShareImage(container._flattenedBlob, container._flattenedFilename, clickButton, originalText);
      }
      return;
    }
    if (clickButton) clickButton.innerText = originalText;
    alert("Still preparing this image - please try again in a moment.");
  };

  setTimeout(tryGenerate, 300);
}

// Saves or shares an image Blob, choosing the best available method:
// 1. Web Share API with files (iOS Safari, Android Chrome) - opens the
//    native share sheet, which includes "Save Image" and direct sharing
//    to social apps. Most reliable path on mobile/tablet.
// 2. Blob URL + <a download> (desktop Chrome, Firefox, Edge, macOS Safari)
// 3. Last resort: open the blob URL in a new tab so the user can
//    long-press / right-click to save it manually.
function saveOrShareImage(blob, filename, clickButton, originalText) {
  const file = new File([blob], filename, { type: "image/jpeg" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({
      files: [file],
      title: filename
    }).then(function () {
      if (clickButton) clickButton.innerText = originalText;
    }).catch(function (err) {
      if (clickButton) clickButton.innerText = originalText;
      if (err && err.name !== "AbortError") {
        console.error("Share failed:", err);
      }
    });
    return;
  }

  const blobUrl = URL.createObjectURL(blob);

  try {
    const dlLink = document.createElement('a');
    dlLink.download = filename;
    dlLink.href = blobUrl;
    document.body.appendChild(dlLink);
    dlLink.click();
    document.body.removeChild(dlLink);
    if (clickButton) clickButton.innerText = originalText;
  } catch (e) {
    console.error("Download failed, opening in new tab instead:", e);
    window.open(blobUrl, "_blank");
    if (clickButton) clickButton.innerText = originalText;
  } finally {
    setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 4000);
  }
}
