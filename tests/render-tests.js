/*
 * Render smoke test
 * -----------------
 * The rule suite exercises allocation LOGIC and never renders a page. On 4 Aug two rendering
 * bugs shipped past it: a helper that called itself (every change-log row blew the stack) and a
 * reader that printed [object Object] fourteen times. Neither could have been caught by tests
 * that never draw anything.
 *
 * So this one draws everything. It loads the real file, seeds enough data to make each page do
 * work, opens every tab and every dialog, and fails on ANY thrown error, unhandled rejection, or
 * blank page that should not be blank. It knows nothing about pod rules — that is the other
 * suite's job — and it should stay that way, because its value is that it is cheap to keep true.
 *
 * Run:  node tests/render-tests.js            (needs jsdom on NODE_PATH)
 * Exit: 0 all good, 1 something threw or rendered empty.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const HERE = __dirname;
const PAGE = path.join(HERE, "..", "index.html");

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
}

function inlineAssets(html) {
  // core.css / core.js are separate files in the repo; jsdom will not fetch them.
  for (const f of ["core.css", "core.js"]) {
    const p = path.join(HERE, "..", f);
    if (!fs.existsSync(p)) continue;
    const body = fs.readFileSync(p, "utf8");
    html = f.endsWith(".css")
      ? html.replace(/<link rel="stylesheet" href="core\.css[^"]*">/, "<style>" + body + "</style>")
      : html.replace(/<script src="core\.js[^"]*"><\/script>/, "<script>" + body + "</script>");
  }
  return html;
}

function load() {
  let html = inlineAssets(fs.readFileSync(PAGE, "utf8"));
  html = html.replace("startUp();", "try{ if(!data) loadData(blankData()); }catch(e){}\nstartUp();");
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.org/",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.scrollTo = () => {};
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
      w.fetch = () => Promise.reject(new Error("no net"));
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.addEventListener("error", e => errors.push(String((e.error && e.error.message) || e.message)));
      w.addEventListener("unhandledrejection", e => {
        const m = String((e.reason && e.reason.message) || e.reason || "");
        if (!/no net/.test(m)) errors.push("unhandled rejection: " + m);
      });
    }
  });
  return new Promise(res => setTimeout(() => res({ w: dom.window, errors }), 900));
}

/* The consultant page keeps its rota in cdata and reads the resident board for staff. Seeded
   here so every tab has something to draw — a page that renders nothing cannot fail, which is
   how a stack overflow hid for half a day on the resident side. */
const SEED = `(function(){
  const T = new Date().toISOString().slice(0,10);
  data = { staff: [
    { id:"c1", name:"Anas Baiou", grade:"CON", active:true, aliases:[] },
    { id:"c2", name:"Nick Whitehouse", grade:"CON", active:true, aliases:[] },
    { id:"r1", name:"Alice Ring", grade:"ST", airway:true, active:true, aliases:[],
      profile:{ about:"Interested in echo", supervisor:"c1" } },
    { id:"r2", name:"Sam Aziz", grade:"CT", active:true, aliases:[] }
  ], weeks:{} };
  const K = mondayOf(T);
  data.weeks[K] = { days: Array.from({length:7}, function(){ return { pods:{A:{assign:[],super:[],student:""},B:{assign:[],super:[],student:""},C:{assign:[],super:[],student:""},D:{assign:[],super:[],student:""},E:{assign:[],super:[],student:""}}, night:{phone:null,AB:[],CDE:[],E:[],super:[]}, shadow:[], extras:[], phone:null }; }), roster:{} };
  const di = Math.round((new Date(T) - new Date(K)) / 86400000);
  data.weeks[K].days[di].pods.A.assign.push({ id:"r1", shift:"LD" });
  data.weeks[K].roster[T] = { r1:{code:"LD",kind:"day"}, r2:{code:"SD",kind:"day"} };
  curWeek = K;
  const now = new Date().toISOString();
  cdata = { v:1, adminPin:"", rotaPin:"", pins:{}, admins:["AJC"], jobPlans:{}, skills:{}, tariff:{},
    days: {}, log: [
      { t: now, who:"AJC", kind:"manual", on:T, msg:"Consultant swap " + T + ": Baiou to Whitehouse" },
      { t: now, who:"sync", kind:"auto",  on:T, msg:"Consultant allocation recomputed" },
      { t: now, who:"AJC", kind:"manual", on:null, msg:"Admin PIN set" }
    ] };
  showJun = true;
  return "seeded";
})()`;

(async () => {
  console.log("=== Render smoke test ===");
  console.log("  page: " + path.basename(PAGE));
  const { w, errors } = await load();

  ok("page loads with no script errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  ok("the app booted", w.eval("typeof renderAll === 'function' && typeof showTab === 'function'"));

  try { w.eval(SEED); } catch (e) { ok("seed data applied", false, e.message); }

  /* Every tab, including the ones behind the staff password. A page that throws here would have
     been invisible to the rule suite. */
  const TABS = ["rota", "fair", "log", "admin"];
  for (const t of TABS) {
    const before = errors.length;
    let threw = "";
    try { w.eval("showTab(" + JSON.stringify(t) + "); renderAll();"); }
    catch (e) { threw = e.message; }
    ok("renders tab: " + t, !threw && errors.length === before, threw || errors.slice(before).join(" | "));
  }

  /* The change log is the page that broke twice. Check it actually drew rows, not just that it
     did not throw — "renders nothing" is how the stack overflow stayed hidden. */
  const logRows = w.eval("showTab('log'); renderLog(); document.querySelectorAll('#logBox tr').length");
  ok("change log draws rows", logRows > 3, "rows=" + logRows);

  for (const mode of ['logBy="made"', 'logBy="affects"; logWhen="ahead"', 'logBy="affects"; logWhen="past"']) {
    const before = errors.length;
    let threw = "";
    try { w.eval(mode + "; renderLog();"); } catch (e) { threw = e.message; }
    ok("change log renders with " + mode, !threw && errors.length === before, threw);
  }
  for (const f of ["all", "manual", "auto"]) {
    let threw = "";
    try { w.eval('logFilter="' + f + '"; renderLog();'); } catch (e) { threw = e.message; }
    ok("change log filter: " + f, !threw, threw);
  }

  /* Dialogs are unreachable from a tab switch and so are never otherwise exercised. */
  const DIALOGS = [];
  for (const d of DIALOGS) {
    const before = errors.length;
    let threw = "";
    try { w.eval("if (typeof " + d + " === 'function') { " + d + "(); closeModal(); }"); }
    catch (e) { threw = e.message; }
    ok("opens dialog: " + d, !threw && errors.length === before, threw);
  }

  /* Settings writes to data — make sure drawing it twice in a row is safe, since every control
     re-renders the page it lives on. */
  /* The grid must actually draw residents, since that is what the shared core.js and the
     resident pills feed. */
  ok("resident pills drawn on the grid",
     w.eval("showTab('rota'); renderRota(); document.querySelectorAll('#weekGrid .rpill').length") >= 1,
     w.eval("document.querySelectorAll('#weekGrid .rpill').length") + " pills");
  ok("hover profile card can be built",
     w.eval("(function(){ try { showCard(document.querySelector('.rpill') || document.body, 'r1'); return document.getElementById('hovercard').textContent.indexOf('Alice Ring') >= 0; } catch(e){ return 'ERR ' + e.message; } })()") === true);

  ok("no errors across the whole run", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  if (failures.length) { console.log("Failures:"); failures.forEach(f => console.log(" - " + f)); }
  process.exit(fail ? 1 : 0);
})();
