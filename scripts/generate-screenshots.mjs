#!/usr/bin/env node
// fallow-ignore-file unused-file
// Manual dev tool, run via scripts/generate-screenshots.sh
/**
 * Generates the graphical store screenshots (docs/marketing/screenshots/*.png).
 *
 * Each shot renders the REAL extension UI — the production PAGE_UI_STYLES string
 * is pulled verbatim from entrypoints/content/pageUi.styles.ts and the markup
 * uses the same .you-loop-* class names the React components emit — enlarged on
 * a flat étude-brand canvas with an instructional caption + annotation. No video
 * frame: the UI is the subject, lit clearly, never cut off.
 *
 * Output: 1280×800 PNGs, captured with headless Chrome.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = join(ROOT, "docs/marketing/screenshots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// ── Pull the production UI stylesheet verbatim ───────────────────────────────
const stylesSrc = readFileSync(
  join(ROOT, "entrypoints/content/pageUi.styles.ts"),
  "utf8"
);
const m = stylesSrc.match(/PAGE_UI_STYLES\s*=\s*`([\s\S]*?)`;/);
if (!m) throw new Error("Could not extract PAGE_UI_STYLES");
// The saved-videos index isn't rendered in these shots; drop the interpolation
// so the extracted CSS is valid standalone.
const PAGE_UI_STYLES = m[1].replace(/\$\{VIDEO_LIST_STYLES\}/g, "");

const FRAME_CSS = readFileSync(
  join(OUT, "templates/shot.css"),
  "utf8"
);

// ── Reusable real-UI fragments (markup mirrors the components) ───────────────
const WORDMARK = `é<span class="you-loop-eacute-acc">é</span>`;

// The control pill in its enabled state: power · Loop/One-shot · speed · zoom ·
// saved · help. data-on="true" so the cluster is expanded.
function pill({ mode = "loop", rate = "1", zoom = false } = {}) {
  return `
  <div class="you-loop-panel" data-on="true">
    <button class="you-loop-power" data-on="true" aria-label="Disable loop range">
      <svg viewBox="0 0 24 24"><path d="M12 3.5v7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M7.6 6.6a7 7 0 1 0 8.8 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
    </button>
    <div class="you-loop-center">
      <div class="you-loop-wordmark-slot"></div>
      <div class="you-loop-cluster">
        <div class="you-loop-cluster-inner">
          <div class="you-loop-modes" role="group" data-disabled="false">
            <button class="you-loop-mode-option" data-active="${mode === "loop"}">Loop</button>
            <button class="you-loop-mode-option" data-active="${mode === "one-shot"}">One-shot</button>
          </div>
          <div class="you-loop-speed" role="group" data-disabled="false">
            <button class="you-loop-speed-value" data-modified="${rate !== "1"}">
              <span class="you-loop-speed-num">${rate}<span class="you-loop-speed-x">×</span></span>
            </button>
          </div>
          <button class="you-loop-zoom-toggle" data-on="${zoom}" data-disabled="false">
            <svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
          </button>
          <button class="you-loop-loops-toggle">
            <svg viewBox="0 0 24 24"><path d="M7 4h10v16l-5-3.5L7 20z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>
    <button class="you-loop-help-toggle">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.05" fill="currentColor"/></svg>
    </button>
  </div>`;
}

// The magnified zoom timeline. start/end are display strings; loop fill spans
// startPct→endPct, playhead sits at headPct (all 0–100).
function zoomStrip({ start = "1:12", end = "1:39", s = 20, e = 78, head = 52 } = {}) {
  return `
  <div class="you-loop-zoom" role="group">
    <span class="you-loop-zoom-badge"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M14.8 14.8L20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></span>
    <span class="you-loop-zoom-time">${start}</span>
    <div class="you-loop-zoom-track">
      <div class="you-loop-zoom-fill" style="left:${s}%;width:${e - s}%"></div>
      <button class="you-loop-zoom-cursor" data-edge="start" style="left:${s}%"></button>
      <button class="you-loop-zoom-cursor" data-edge="end" style="left:${e}%"></button>
      <div class="you-loop-zoom-playhead" style="left:${head}%;opacity:1"></div>
    </div>
    <span class="you-loop-zoom-time">${end}</span>
  </div>`;
}

// The speed scrub popover (tick tape + needle + value + reset target). Ticks are
// laid out statically across the 148px rail; 1× is the teal home tick.
function speedPop({ value = "0.5×" } = {}) {
  // Build the visible tick window: labelled quarter stops + bare 0.05 ticks.
  const stops = [];
  for (let v = 25; v <= 175; v += 5) stops.push(v / 100); // 0.25×–1.75× window
  const railH = 148;
  // Map: place 1.0 at the needle (centre) when value=0.5 the tape is offset so
  // 0.5 sits at the needle. We render statically with 0.5 under the needle.
  const center = 0.5;
  const pxPerStep = 13; // visual spacing between 0.05 ticks
  const ticks = stops
    .map((stop) => {
      const y = railH / 2 + (center - stop) / 0.05 * pxPerStep;
      if (y < 8 || y > railH - 8) return "";
      const labeled = Math.round(stop * 100) % 25 === 0;
      const home = stop === 1;
      return `<div class="you-loop-speed-tick" data-labeled="${labeled}" data-home="${home}" style="top:${y}px">${
        labeled
          ? `<span class="you-loop-speed-tick-label">${Number(stop.toFixed(2))}</span>`
          : ""
      }</div>`;
    })
    .join("");
  return `
  <div class="you-loop-speed-pop" data-armed="false" style="--you-loop-arm:0">
    <div class="you-loop-speed-rail">
      <div class="you-loop-speed-tape">${ticks}</div>
      <div class="you-loop-speed-needle"></div>
    </div>
    <span class="you-loop-speed-needle-value">${value}</span>
    <div class="you-loop-speed-reset-target">
      <svg class="you-loop-speed-reset-chevrons" viewBox="0 0 26 12"><path d="M2 1.5 L7 6 L2 10.5"/><path d="M10 1.5 L15 6 L10 10.5"/><path d="M18 1.5 L23 6 L18 10.5"/></svg>
      <span class="you-loop-speed-reset-col"><span class="you-loop-speed-reset-ring">1×</span><span class="you-loop-speed-reset-word">reset</span></span>
    </div>
  </div>`;
}

function savedModal() {
  const rows = [
    { name: "Solo — bars 33–40", range: "1:12 – 1:39", sel: true },
    { name: "Intro riff", range: "0:04 – 0:22", sel: false },
    { name: "Chorus turnaround", range: "2:48 – 3:05", sel: false },
    { name: "Outro lick", range: "4:10 – 4:27", sel: false }
  ]
    .map(
      (r) => `
      <li class="you-loop-lm-row" data-selected="${r.sel}">
        <button class="you-loop-lm-apply">
          <span class="you-loop-lm-name-text">${r.name}</span>
          <span class="you-loop-lm-range">${r.range}</span>
        </button>
        <span class="you-loop-lm-actions"><button>✕</button></span>
      </li>`
    )
    .join("");
  return `
  <div class="you-loop-lm">
  <div class="you-loop-lm-card" role="dialog" aria-label="Saved loops">
    <button class="you-loop-lm-close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
    <header class="you-loop-lm-head">
      <h2 class="you-loop-lm-title">Saved loops</h2>
      <p class="you-loop-lm-sub">Current selection · 1:12 – 1:39</p>
    </header>
    <nav class="you-loop-lm-tabs" role="tablist">
      <button class="you-loop-lm-tab" data-active="true">This video</button>
      <button class="you-loop-lm-tab" data-active="false">Saved videos</button>
    </nav>
    <div class="you-loop-lm-pane">
      <section class="you-loop-lm-list-wrap">
        <h3 class="you-loop-lm-label">Your loops</h3>
        <ul class="you-loop-lm-list">${rows}</ul>
      </section>
      <section class="you-loop-lm-save" data-disabled="false">
        <h3 class="you-loop-lm-label">Save current loop</h3>
        <input class="you-loop-loops-input you-loop-lm-name" type="text" placeholder="Name this loop" value="Verse 2 phrasing" />
        <button class="you-loop-lm-savebtn">Save</button>
      </section>
    </div>
  </div>
  </div>`;
}

// JS that runs in-page after layout. Transform-scaled UI reports its visual
// rect via getBoundingClientRect, so we measure each control and draw a teal
// connector line to a floating label — a real annotated diagram, not guesswork.
const OVERVIEW_CALLOUTS = `<script>
(function(){
  function run(){
    var layer=document.getElementById('cl');
    var pill=document.querySelector('.you-loop-panel').getBoundingClientRect();
    var T=[
      {sel:'.you-loop-modes',text:'Playback mode'},
      {sel:'.you-loop-speed',text:'Speed · 0.25–3×'},
      {sel:'.you-loop-zoom-toggle',text:'Zoom in'},
      {sel:'.you-loop-loops-toggle',text:'Saved loops'}
    ];
    var ns='http://www.w3.org/2000/svg';
    T.forEach(function(t,i){
      var el=document.querySelector(t.sel); if(!el) return;
      var r=el.getBoundingClientRect();
      var cx=r.left+r.width/2, by=r.bottom;
      // Labels sit below the pill, alternating depth so adjacent labels don't
      // collide; a connector runs from each control's bottom down to its label.
      var ly=pill.bottom+(i%2?28:86);
      var lab=document.createElement('div');
      lab.className='cl-label'; lab.style.left=cx+'px'; lab.style.top=ly+'px';
      lab.textContent=t.text; document.body.appendChild(lab);
      var line=document.createElementNS(ns,'line');
      line.setAttribute('x1',cx); line.setAttribute('y1',by+4);
      line.setAttribute('x2',cx); line.setAttribute('y2',ly-7);
      line.setAttribute('class','cl-line'); layer.appendChild(line);
      var dot=document.createElementNS(ns,'circle');
      dot.setAttribute('cx',cx); dot.setAttribute('cy',by+3); dot.setAttribute('r',3);
      dot.setAttribute('class','cl-dot'); layer.appendChild(dot);
    });
  }
  document.fonts.ready.then(function(){requestAnimationFrame(function(){requestAnimationFrame(run);});});
})();
</script>`;

// Draws the "zoom funnel": dashed guides from the loop band's edges down to the
// magnified strip's edges, so it reads visually as the region being expanded.
const ZOOM_FUNNEL = `<script>
(function(){
  function run(){
    var layer=document.getElementById('cl');
    var band=document.querySelector('.you-loop-loop-range').getBoundingClientRect();
    var track=document.querySelector('.you-loop-zoom-track').getBoundingClientRect();
    var ns='http://www.w3.org/2000/svg';
    // The zoom strip sits ABOVE the main timeline, so the funnel runs upward
    // from the loop band's top edge to the magnified strip's bottom edge.
    var poly=document.createElementNS(ns,'polygon');
    poly.setAttribute('points', band.left+','+band.top+' '+band.right+','+band.top+' '+track.right+','+track.bottom+' '+track.left+','+track.bottom);
    poly.setAttribute('class','cl-funnel-fill'); layer.appendChild(poly);
    [[band.left,band.top,track.left,track.bottom],[band.right,band.top,track.right,track.bottom]].forEach(function(p){
      var l=document.createElementNS(ns,'line');
      l.setAttribute('x1',p[0]); l.setAttribute('y1',p[1]); l.setAttribute('x2',p[2]); l.setAttribute('y2',p[3]);
      l.setAttribute('class','cl-funnel-line'); layer.appendChild(l);
    });
  }
  document.fonts.ready.then(function(){requestAnimationFrame(function(){requestAnimationFrame(run);});});
})();
</script>`;

const KEYS = `
  <div class="keys">
    <div class="keyitem"><div class="keycap">A</div><div class="knm">Restart</div><div class="kdesc">Jump to the start of the loop and play.</div></div>
    <div class="keyitem"><div class="keycap">S</div><div class="knm">Cue <span class="khold">hold</span></div><div class="kdesc">Play from the top; release snaps back.</div></div>
    <div class="keyitem"><div class="keycap">D</div><div class="knm">Push-to-play <span class="khold">hold</span></div><div class="kdesc">Hold to listen, release to pause in place.</div></div>
    <div class="keyitem"><div class="keycap">[ ]</div><div class="knm">Nudge loop</div><div class="kdesc">Shift the loop region back/forward, maintaining loop length.</div></div>
  </div>`;

const MAG_GLASS = `<svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="2.4"/><path d="M14.8 14.8L20 20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

// ── The four shots ───────────────────────────────────────────────────────────
const SHOTS = [
  {
    name: "01-overview",
    caption: `Minimal look. <em>Maximum control.</em>`,
    scene: `
      <div style="display:flex;flex-direction:column;align-items:center">
        <div style="height:24px"></div>
        <div class="reserve" style="height:108px;margin-bottom:156px">
          <div class="mag" style="transform:scale(2.0)">${pill({ mode: "loop", rate: "1" })}</div>
        </div>
        <div>
          <div class="kbd-eyebrow">Keyboard shortcuts</div>
          ${KEYS}
        </div>
      </div>
      <svg class="cl-layer" id="cl"></svg>
      ${OVERVIEW_CALLOUTS}`
  },
  {
    name: "02-loop-zoom",
    caption: `Loop a section — then <em>zoom in</em>.`,
    scene: `
      <div style="display:flex;flex-direction:column;align-items:center">
        <div class="reserve" style="height:70px">
          <div class="mag" style="transform:scale(1.7)">${zoomStrip({ start: "1:12", end: "1:39", s: 6, e: 94, head: 50 })}</div>
        </div>
        <div style="height:92px"></div>
        <div class="reserve" style="height:104px">
          <div class="mag" style="transform:scale(1.5)">
            <div class="scrubber">
              <div class="rail"></div>
              <div class="watched"></div>
              <div class="you-loop-timeline">
                <div class="you-loop-loop-range" style="left:30%;width:28%"></div>
                <div class="you-loop-handle" style="left:30%"></div>
                <div class="you-loop-handle" style="left:58%"></div>
              </div>
              <div class="yt-playhead"></div>
            </div>
          </div>
        </div>
        <p class="annot" style="margin-top:40px;max-width:900px">Mark a loop on the timeline, then open the <span class="t">zoom timeline</span>: it stretches just that region across the whole bar, so it makes a tiny region that's difficult to work with easier to manage — <strong>far more granular control</strong>, down to the split second.</p>
      </div>
      <svg class="cl-layer" id="cl"></svg>
      ${ZOOM_FUNNEL}`
  },
  {
    name: "03-speed",
    caption: `Slow it down.<br><em>0.25× to 3×, in fine steps.</em>`,
    scene: `
      <div class="mag" style="zoom:2.2">${speedPop({ value: "0.5×" })}</div>
      <p class="annot" style="margin-top:18px">Hold the speed readout and drag up or down to scrub the tempo in 0.05× steps. Take a hard passage slow, then bring it back up — fling right to snap home to <span class="t">1×</span>.</p>`
  },
  {
    name: "04-saved",
    caption: `Pick up where you <em>left off</em>.`,
    scene: `
      <div class="mag" style="zoom:1.12">${savedModal()}</div>`,
    sub: `Name and save loops per video — tomorrow's practice starts where today's ended.`
  }
];

// ── Render ───────────────────────────────────────────────────────────────────
const TMP = mkdtempSync(join(tmpdir(), "etude-shots-"));
const FONTS =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400..600&family=Instrument+Sans:wght@400;500;600&family=Roboto:wght@400;500;700&display=swap';

// Production CSS names the brand serif "Étude Fraunces" (self-hosted in the
// extension). Alias it to the Google Fraunces we load here.
const FONT_ALIAS = `
  .you-loop-help-eyebrow, .you-loop-wordmark, .you-loop-eacute,
  .you-loop-eacute-acc { font-family: "Fraunces", Georgia, serif !important; }
`;

for (const shot of SHOTS) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${FONTS}" />
<style>${PAGE_UI_STYLES}\n${FONT_ALIAS}\n${FRAME_CSS}</style>
</head>
<body>
  <div class="stage">
    <div class="caption"><div class="tick"></div><h2>${shot.caption}${
    shot.sub ? `<span class="caption-sub">${shot.sub}</span>` : ""
  }</h2></div>
    <div class="scene">${shot.scene}</div>
  </div>
  <span class="stamp"><span class="eacute">é<span class="acc">é</span></span>tude</span>
  <span class="tag">Free · No account · No tracking</span>
</body></html>`;
  const htmlPath = join(TMP, `${shot.name}.html`);
  writeFileSync(htmlPath, html);
  const outPath = join(OUT, `${shot.name}.png`);
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      `--screenshot=${outPath}`,
      "--window-size=1280,800",
      "--hide-scrollbars",
      "--virtual-time-budget=6000",
      `file://${htmlPath}`
    ],
    { stdio: "inherit" }
  );
  console.log(`✓ ${shot.name}.png`);
}

rmSync(TMP, { recursive: true, force: true });
console.log(`\nGraphical screenshots written to ${OUT}/{01..05}-*.png`);
