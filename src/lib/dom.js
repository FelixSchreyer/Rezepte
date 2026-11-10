// Tiny DOM helpers. `el` is the element builder every render* function uses.

export function el(tag, opts, children) {
  var node = document.createElement(tag);
  opts = opts || {};
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.attrs) for (var k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
  if (opts.style) node.style.cssText = opts.style;
  if (opts.on) for (var ev in opts.on) node.addEventListener(ev, opts.on[ev]);
  (children || []).forEach(function(c){ if (c) node.appendChild(c); });
  return node;
}

export function initials(name) {
  if (!name) return "?";
  var parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

// "today 14:20", "Tue 14:20" within the last week, otherwise "3 Feb".
export function sinceLabel(ts, now) {
  var d = new Date(ts);
  var today = new Date(now || Date.now());
  var time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return "today " + time;
  var days = (today.getTime() - d.getTime()) / 86400000;
  if (days < 6) return d.toLocaleDateString("en-GB", { weekday: "short" }) + " " + time;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
