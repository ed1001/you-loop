      // Entry point: loaded by index.html via <script src="app.js">. fallow
      // doesn't parse HTML, so it can't see the reference and flags this unused.
      // fallow-ignore-file unused-file
      (function () {
        var MODES = {
          a: {
            desc: "<strong>Restart.</strong> The loop plays on repeat. Press A any time to snap back to the top of the region.",
            hint: "press A to restart the loop",
          },
          s: {
            desc: "<strong>Cue.</strong> Hold S to play from the start of the loop. Release and you snap straight back, set for another run — just like the cue button on a DJ deck.",
            hint: "press and hold S to play, release to snap back",
          },
          d: {
            desc: "<strong>Push-to-play.</strong> Hold D to hear the part. Release to pause. Hold again to carry on from where you left off.",
            hint: "press and hold D to listen, release to pause, hold again to carry on",
          },
        };
        var START = 15,
          END = 85,
          SPEED = 14; /* % per second */
        var reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        var dot = document.getElementById("demo-dot");
        var keyEl = document.getElementById("demo-key");
        var descEl = document.getElementById("demo-desc");
        var hintEl = document.getElementById("demo-hint-text");
        var tabs = Array.prototype.slice.call(
          document.querySelectorAll(".tab"),
        );
        var mode = "a",
          pos = START,
          held = false,
          last = performance.now();

        function setMode(m) {
          mode = m;
          pos = START;
          held = false;
          keyEl.classList.remove("pressed");
          keyEl.textContent = m.toUpperCase();
          descEl.innerHTML = MODES[m].desc;
          hintEl.textContent = MODES[m].hint;
          tabs.forEach(function (t) {
            var on = t.dataset.mode === m;
            t.classList.toggle("active", on);
            t.setAttribute("aria-selected", on);
          });
        }
        function press() {
          if (mode === "a") {
            pos = START;
            keyEl.classList.add("pressed");
            setTimeout(function () {
              keyEl.classList.remove("pressed");
            }, 160);
          } else {
            held = true;
            keyEl.classList.add("pressed");
          }
        }
        function release() {
          if (mode === "a") return;
          held = false;
          keyEl.classList.remove("pressed");
          if (mode === "s") pos = START;
        }
        function hasModifier(e) {
          return e.metaKey || e.ctrlKey || e.altKey;
        }
        function ignoreKey(e, k) {
          return !MODES[k] || e.repeat || hasModifier(e);
        }
        function stepPlaying() {
          return held || (mode === "a" && !reduced);
        }
        function step(t) {
          var dt = Math.min((t - last) / 1000, 0.1);
          last = t;
          if (stepPlaying()) {
            pos += SPEED * dt;
            if (pos > END) pos = START;
          }
          dot.style.left = pos + "%";
          requestAnimationFrame(step);
        }

        tabs.forEach(function (t) {
          t.addEventListener("click", function () {
            setMode(t.dataset.mode);
          });
        });
        document.addEventListener("keydown", function (e) {
          var k = e.key.toLowerCase();
          if (ignoreKey(e, k)) return;
          if (k !== mode) setMode(k);
          press();
        });
        document.addEventListener("keyup", function (e) {
          if (e.key.toLowerCase() === mode) release();
        });
        keyEl.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          press();
        });
        keyEl.addEventListener("pointerup", release);
        keyEl.addEventListener("pointerleave", release);

        setMode("a");
        requestAnimationFrame(step);
      })();

      /* scroll-reveal for feature blocks */
      (function () {
        var els = document.querySelectorAll(".reveal");
        if (!els.length) return;
        var reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        // reduced-motion or no IntersectionObserver: leave content visible,
        // never arm the hidden state
        if (reduced || !("IntersectionObserver" in window)) return;
        document.documentElement.classList.add("reveal-ready");
        var io = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting) {
                e.target.classList.add("in");
                io.unobserve(e.target);
              }
            });
          },
          { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
        );
        els.forEach(function (el) {
          io.observe(el);
        });
      })();

      /* panel showcase — a guided cursor tour driving a faithful recreation of
         the real on-video control pill, with a live playhead, zoom strip and
         speed dial. */
      // Resolve the showcase root elements, or null when the section is absent
      // or animation should be skipped (reduced motion / no IntersectionObserver
      // — the pill is then left in its static on state).
      function panelEnvOk(stage, reduced) {
        return stage && !reduced && "IntersectionObserver" in window;
      }
      function getPanelRefs() {
        var stage = document.getElementById("panelstage");
        var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!panelEnvOk(stage, reduced)) return null;
        var panel = stage.querySelector(".epanel");
        return panel ? { stage: stage, panel: panel } : null;
      }
      (function () {
        var refs = getPanelRefs();
        if (!refs) return;
        var stage = refs.stage;
        var panel = refs.panel;

        var power = panel.querySelector(".epower");
        var loopBtn = panel.querySelector('.emode[data-mode="loop"]');
        var oneShot = panel.querySelector('.emode[data-mode="one-shot"]');
        var zoomBtn = panel.querySelector(".ezoom");
        var speed = panel.querySelector(".espeed");
        var speedVal = panel.querySelector(".espeed-val");
        var speedPop = stage.querySelector(".speedpop");
        var tape = stage.querySelector(".speedpop .tape");
        var headMain = stage.querySelector(".tl .playhead");
        var headZoom = stage.querySelector(".zplayhead");
        var zcA = stage.querySelector(".zcursor.a");
        var zcB = stage.querySelector(".zcursor.b");
        var zfill = stage.querySelector(".zfill");
        var resetWord = stage.querySelector(".resetword");
        var tlEl = stage.querySelector(".tl");
        var ztrackEl = stage.querySelector(".ztrack");
        var playBtn = stage.querySelector(".ytplay");
        var cursor = stage.querySelector(".ecursor");
        var ring = stage.querySelector(".ecclick");

        // --- speed tape: build the vertical tick rail once ---
        var MIN = 0.25,
          MAX = 3.0,
          STEP = 0.05,
          STEP_PX = 13,
          RAIL_MID = 74;
        function tickTop(rate) {
          return ((MAX - rate) / STEP) * STEP_PX;
        }
        function tickHtml(rate) {
          var labeled = Math.round(rate * 100) % 25 === 0;
          var home = Math.abs(rate - 1) < 0.001;
          var cls = "tick" + (labeled ? " lab" : "") + (home ? " home" : "");
          var lab = labeled
            ? '<span class="tlab">' + Number(rate.toFixed(2)) + "×</span>"
            : "";
          return (
            '<span class="' +
            cls +
            '" style="top:' +
            tickTop(rate) +
            'px">' +
            lab +
            "</span>"
          );
        }
        (function buildTape() {
          var html = "";
          for (var r = MIN; r <= MAX + 0.001; r += STEP) {
            html += tickHtml(Math.round(r * 100) / 100);
          }
          tape.innerHTML = html;
        })();

        // --- live playhead engine (runs the whole time the section is on) ---
        // frac is the playhead position as a 0..1 fraction of the main loop
        // region [a,b]. While zoomed, playback obeys the zoom sub-loop [zs,ze]
        // (also 0..1 within the region); otherwise the whole region [0,1].
        var REGION = { a: 0.35, b: 0.65 }; // symmetric so the band centres under the pill
        var BASE_DUR = 2600; // ms to sweep the full region at 1×
        var frac = 0,
          rate = 1,
          mode = "loop",
          zoomed = false,
          zs = 0,
          ze = 1, // zoom sub-loop bounds within the region
          playing = false,
          last = null;
        function bounds() {
          return zoomed ? { lo: zs, hi: ze } : { lo: 0, hi: 1 };
        }
        function paintHeads() {
          var x = REGION.a + frac * (REGION.b - REGION.a);
          if (headMain) headMain.style.left = x * 100 + "%";
          if (headZoom) headZoom.style.left = frac * 100 + "%";
        }
        function paintZoom() {
          if (zcA) zcA.style.left = zs * 100 + "%";
          if (zcB) zcB.style.left = ze * 100 + "%";
          if (zfill) {
            zfill.style.left = zs * 100 + "%";
            zfill.style.width = (ze - zs) * 100 + "%";
          }
        }
        // Zoom sub-loop bounds [zs,ze] such that the left zoom cursor sits the
        // same screen distance inside the left main handle as the right cursor
        // does inside the right handle. The zoom track is inset by the strip's
        // badge/labels, so equal *fractions* wouldn't look symmetric — solve in
        // pixels. insetRatio is the gap as a fraction of the main region width.
        function symZoom(insetRatio) {
          var tlR = tlEl.getBoundingClientRect();
          var zR = ztrackEl.getBoundingClientRect();
          var mainL = tlR.left + REGION.a * tlR.width;
          var mainR = tlR.left + REGION.b * tlR.width;
          var gap = insetRatio * (mainR - mainL);
          var lo = (mainL + gap - zR.left) / zR.width;
          var hi = (mainR - gap - zR.left) / zR.width;
          return {
            zs: Math.max(0, Math.min(1, lo)),
            ze: Math.max(0, Math.min(1, hi)),
          };
        }
        // Step the playhead one frame. At the loop end: wrap (loop) or stop
        // dead (one-shot).
        function advance(dt) {
          if (!playing) return;
          var b = bounds();
          frac += dt / (BASE_DUR / rate);
          if (frac < b.hi) return;
          if (mode === "loop") {
            frac = b.lo;
          } else {
            frac = b.hi;
            playing = false;
          }
        }
        function syncPlayIcon() {
          if (!playBtn) return;
          var p = String(playing);
          if (playBtn.dataset.playing !== p) playBtn.dataset.playing = p;
        }
        function frame(ts) {
          if (last == null) last = ts;
          var dt = ts - last;
          last = ts;
          advance(dt);
          paintHeads();
          syncPlayIcon();
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);

        // --- state helpers ---
        function setMode(m) {
          mode = m;
          loopBtn.classList.toggle("active", m === "loop");
          oneShot.classList.toggle("active", m === "one-shot");
        }
        function setRate(r) {
          rate = r;
          speedVal.textContent = r.toFixed(2) + "×";
          speedVal.classList.toggle("off", Math.abs(r - 1) > 0.001);
          tape.style.transform = "translateY(" + (RAIL_MID - tickTop(r)) + "px)";
        }
        function reset() {
          panel.dataset.on = "false";
          stage.dataset.armed = "false";
          stage.dataset.zoom = "false";
          zoomBtn.classList.remove("on");
          setMode("loop");
          setRate(1);
          speedPop.classList.remove("show");
          speedPop.dataset.armed = "false";
          if (resetWord) resetWord.textContent = "reset";
          speedPop.style.setProperty("--arm", "0");
          playing = false;
          zoomed = false;
          zs = 0;
          ze = 1;
          frac = 0;
          paintZoom();
        }
        setRate(1);
        reset();

        // Pin the play/pause icon to the pill's vertical centre, far left of
        // the stage (it's hidden on narrow screens where the pill would reach
        // it — see the media query in the stylesheet).
        function layoutPlay() {
          if (!playBtn) return;
          var s = stage.getBoundingClientRect();
          var p = panel.getBoundingClientRect();
          var k = s.width / stage.offsetWidth || 1;
          playBtn.style.top = (p.top - s.top + p.height / 2) / k + "px";
        }
        layoutPlay();
        window.addEventListener("resize", layoutPlay);

        var sleep = function (ms) {
          return new Promise(function (r) {
            setTimeout(r, ms);
          });
        };
        // Center of an element, in coordinates relative to the stage.
        function center(el, dx, dy) {
          var s = stage.getBoundingClientRect();
          var r = el.getBoundingClientRect();
          // undo any responsive transform:scale so coords are in the stage's
          // local (unscaled) space — that's what cursor transforms live in.
          var k = s.width / stage.offsetWidth || 1;
          return {
            x: (r.left - s.left + r.width / 2) / k + (dx || 0),
            y: (r.top - s.top + r.height / 2) / k + (dy || 0),
          };
        }
        function moveTo(p, scale) {
          cursor.style.transform =
            "translate(" + p.x + "px, " + p.y + "px) scale(" + (scale || 1) + ")";
        }
        async function glide(el, dx, dy) {
          var p = center(el, dx, dy);
          cursor._x = p.x;
          cursor._y = p.y;
          moveTo(p);
          await sleep(720);
        }
        async function click() {
          ring.style.setProperty("--cx", cursor._x + "px");
          ring.style.setProperty("--cy", cursor._y + "px");
          ring.classList.remove("go");
          void ring.offsetWidth;
          ring.classList.add("go");
          moveTo({ x: cursor._x, y: cursor._y }, 0.82);
          await sleep(150);
          moveTo({ x: cursor._x, y: cursor._y }, 1);
          await sleep(240);
        }

        // Press-and-drag the speed readout: pop the dial, scrub 1.00× → 0.50×.
        // The playhead's sweep visibly slows as the rate drops.
        async function dragSpeed() {
          // anchor the dial above the speed chip (stage-local coords)
          var c = center(speedVal, 0, -12);
          speedPop.style.left = c.x + "px";
          speedPop.style.top = c.y + "px";
          speedPop.classList.add("show");
          cursor.classList.add("drag");
          await sleep(240);
          // fine 0.05× clicks at a quick cadence so the dial scrubs smoothly
          var FROM = 1.0,
            TO = 0.5,
            STEPS = 10;
          for (var i = 1; i <= STEPS; i++) {
            var r = Math.round((FROM + (TO - FROM) * (i / STEPS)) * 20) / 20;
            setRate(r);
            var p = center(speedVal, 0, 8 + i * 4);
            cursor._x = p.x;
            cursor._y = p.y;
            moveTo(p, 0.86);
            await sleep(85);
          }
          await sleep(420);
          moveTo({ x: cursor._x, y: cursor._y }, 1);
          cursor.classList.remove("drag");
          speedPop.classList.remove("show"); // rate stays 0.50×, dial tucks away
        }

        // Reset gesture: re-open the dial, then press-and-drag the chip hard
        // right. The rail eases aside and dims, a teal 1× target reveals;
        // release on it (armed) snaps home. Mirrors the real snap-back.
        async function resetSpeed() {
          var c0 = center(speedVal, 0, -12);
          speedPop.style.left = c0.x + "px";
          speedPop.style.top = c0.y + "px";
          speedPop.classList.add("show");
          await sleep(280);
          cursor.classList.add("snap");
          var c = center(speedVal);
          var steps = 14,
            travel = 70;
          for (var i = 1; i <= steps; i++) {
            var a = i / steps;
            speedPop.style.setProperty("--arm", a.toFixed(3));
            var p = { x: c.x + travel * a, y: c.y };
            cursor._x = p.x;
            cursor._y = p.y;
            moveTo(p, 0.9);
            await sleep(45);
          }
          speedPop.dataset.armed = "true"; // ring fills teal, word → "release"
          if (resetWord) resetWord.textContent = "release";
          await sleep(420);
          setRate(1); // release → snap home
          speedPop.dataset.armed = "false";
          if (resetWord) resetWord.textContent = "reset";
          speedPop.style.setProperty("--arm", "0");
          cursor.classList.remove("snap");
          await sleep(320);
          speedPop.classList.remove("show");
        }

        // The two zoom-loop edges, each wrapping its element + getter/setter so
        // the drag routine needs no per-edge branching.
        var edgeA = {
          el: zcA,
          get: function () {
            return zs;
          },
          set: function (v) {
            zs = v;
          },
        };
        var edgeB = {
          el: zcB,
          get: function () {
            return ze;
          },
          set: function (v) {
            ze = v;
          },
        };
        function clampFracToZoom() {
          if (frac < zs) frac = zs;
          if (frac > ze) frac = ze;
        }
        // Drag a zoom cursor inward to shorten the zoom sub-loop. Playback then
        // stays inside [zs,ze] — so on the main bar the playhead now covers
        // only that slice of the region, not its full length.
        async function dragZoom(edge, target) {
          await glide(edge.el);
          // snap mode: zoom handles move instantly (no CSS transition), so the
          // pointer must too — many tiny steps keep it glued to the handle.
          cursor.classList.add("snap");
          var from = edge.get();
          var steps = 18;
          for (var i = 1; i <= steps; i++) {
            edge.set(from + (target - from) * (i / steps));
            paintZoom();
            var p = center(edge.el);
            cursor._x = p.x;
            cursor._y = p.y;
            moveTo(p, 0.86);
            await sleep(40);
          }
          cursor.classList.remove("snap");
          clampFracToZoom();
        }

        async function tour() {
          reset();
          cursor.classList.remove("show");
          await sleep(500);
          var home = center(power, 0, 30);
          cursor._x = home.x;
          cursor._y = home.y;
          moveTo(home);
          await sleep(150);
          cursor.classList.add("show");
          while (true) {
            // 1 — power on: pill expands, loop band + handles + playhead appear
            //     (paused at the start of the region)
            await glide(power);
            await click();
            panel.dataset.on = "true";
            stage.dataset.armed = "true";
            frac = 0;
            playing = false;
            await sleep(1000); // controls slide in

            // 1b — click play: the playhead starts looping the region
            await glide(playBtn);
            await click();
            playing = true;
            await sleep(1700); // watch it loop a couple of times

            // 2 — one-shot: playhead runs to the end and STOPS, no re-loop
            await glide(oneShot);
            await click();
            setMode("one-shot");
            await sleep(2600); // reaches the end, sits there stopped

            // 3 — press Loop again: playback restarts and loops
            await glide(loopBtn);
            await click();
            setMode("loop");
            frac = bounds().lo;
            playing = true;
            await sleep(2200);

            // 4 — speed: drag the dial down to 0.50× and leave it there (the
            //     sweep stays slow through the zoom demo below)
            await glide(speed);
            await dragSpeed();
            await sleep(900);

            // 5 — magnify: the zoom strip rises (and stays up), sub-loop spans
            //     the whole region — cursors sit at the two ends
            await glide(zoomBtn);
            await click();
            zoomed = true;
            zs = 0;
            ze = 1;
            paintZoom();
            stage.dataset.zoom = "true";
            zoomBtn.classList.add("on");
            await sleep(1600);

            // 6 — drag the zoom ends inward to a sub-loop whose cursors are
            //     equidistant (on screen) from the main handles; the playhead
            //     is now confined to it (covers only part of the region)
            var sym = symZoom(0.18);
            await dragZoom(edgeB, sym.ze);
            await sleep(600);
            await dragZoom(edgeA, sym.zs);
            await sleep(2800); // watch it loop the shortened region

            // 6b — reset the speed back to 1.00× (the snap-home gesture)
            await glide(speed);
            await resetSpeed();
            await sleep(700);

            // 7 — round it off: click the power button to turn the panel off
            await glide(power);
            await click();
            panel.dataset.on = "false";
            stage.dataset.armed = "false";
            stage.dataset.zoom = "false";
            zoomBtn.classList.remove("on");
            playing = false;
            await sleep(1100); // watch it power down — strip drops, controls fold
            cursor.classList.remove("show");
            await sleep(700);
            reset(); // restore internals for the next run (already visually off)
            await sleep(450);
            var h = center(power, 0, 30);
            cursor._x = h.x;
            cursor._y = h.y;
            moveTo(h);
            await sleep(150);
            cursor.classList.add("show");
            await sleep(300);
          }
        }

        var started = false;
        var io = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting && !started) {
                started = true;
                tour();
                io.unobserve(e.target);
              }
            });
          },
          { threshold: 0.35 },
        );
        io.observe(stage);
      })();
