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
