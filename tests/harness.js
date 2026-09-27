// A ~100-line test harness that runs in the browser. No Node, no npm, no
// runner to install — open /tests/ and it reports.
//
//   describe("thing", () => { it("does x", () => { expect(a).toEqual(b); }); });
//
// Tests run in declaration order. A throw fails the test and the rest of the
// suite continues. A test function may be async (or return a promise) — it is
// awaited, which is what the Backend contract tests need.

var suites = [];
var current = null;

export function describe(name, fn) {
  current = { name: name, tests: [], before: null, after: null };
  suites.push(current);
  fn();
  current = null;
}

// Optional per-suite setup/teardown, awaited like the tests themselves.
export function beforeAll(fn) {
  if (!current) throw new Error("beforeAll() must be called inside describe()");
  current.before = fn;
}

export function afterAll(fn) {
  if (!current) throw new Error("afterAll() must be called inside describe()");
  current.after = fn;
}

export function it(name, fn) {
  if (!current) throw new Error("it() must be called inside describe()");
  current.tests.push({ name: name, fn: fn });
}

function show(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === undefined) return "undefined";
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

export function expect(actual) {
  return {
    toBe: function (expected) {
      if (actual !== expected) {
        throw new Error("expected " + show(expected) + " but got " + show(actual));
      }
    },
    toEqual: function (expected) {
      var a = JSON.stringify(actual);
      var b = JSON.stringify(expected);
      if (a !== b) throw new Error("expected " + b + "\n            but got " + a);
    },
    toBeNull: function () {
      if (actual !== null) throw new Error("expected null but got " + show(actual));
    },
    toBeCloseTo: function (expected, digits) {
      var d = digits === undefined ? 5 : digits;
      if (Math.abs(actual - expected) > Math.pow(10, -d) / 2) {
        throw new Error("expected ~" + expected + " but got " + actual);
      }
    },
    toHaveLength: function (n) {
      var len = actual ? actual.length : undefined;
      if (len !== n) throw new Error("expected length " + n + " but got " + show(len));
    },
    toContain: function (item) {
      if (!actual || actual.indexOf(item) === -1) {
        throw new Error("expected " + show(actual) + " to contain " + show(item));
      }
    }
  };
}

export async function run(rootEl) {
  var passed = 0;
  var failed = 0;
  var out = document.createElement("div");

  for (var s = 0; s < suites.length; s++) {
    var suite = suites[s];
    var block = document.createElement("section");
    var h = document.createElement("h2");
    h.textContent = suite.name;
    block.appendChild(h);

    if (suite.before) await suite.before();

    for (var i = 0; i < suite.tests.length; i++) {
      var t = suite.tests[i];
      var line = document.createElement("div");
      line.className = "case";
      try {
        await t.fn();
        passed++;
        line.classList.add("pass");
        line.innerHTML = '<span class="mark">✓</span>' + escapeHtml(t.name);
      } catch (err) {
        failed++;
        line.classList.add("fail");
        line.innerHTML = '<span class="mark">✕</span>' + escapeHtml(t.name) +
          '<pre>' + escapeHtml(err && err.message ? err.message : String(err)) + '</pre>';
      }
      block.appendChild(line);
    }

    if (suite.after) await suite.after();

    out.appendChild(block);
  }

  var summary = document.createElement("div");
  summary.className = "summary " + (failed ? "fail" : "pass");
  summary.textContent = failed
    ? passed + " passed, " + failed + " failed"
    : "All " + passed + " tests passed";

  rootEl.innerHTML = "";
  rootEl.appendChild(summary);
  rootEl.appendChild(out);

  // Lets a future headless runner read the result without scraping the DOM.
  window.__testResults = { passed: passed, failed: failed };

  // The first failure goes in the title too, so the result is legible from
  // outside the page (a CI scraper, or `osascript` reading the tab name).
  var firstFail = out.querySelector(".case.fail");
  document.title = (failed ? "✕ " : "✓ ") + passed + "/" + (passed + failed) +
    (firstFail ? " — " + firstFail.textContent.replace(/\s+/g, " ").slice(0, 160) : " — Gut & Grain tests");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
