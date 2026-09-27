// A "choose a photo" button: a hidden file input behind a styled label. On
// phones, accept="image/*" offers both the camera and the photo library.
// The chosen file is shrunk (lib/photos.js) before it reaches `onPhoto`.
//
// opts:
//   size   SCAN_PHOTO for photos of text that must stay legible
//          (default: dish-photo size)
//   icon   SVG markup. On its own: show only the icon, with `label` as its
//          accessible name. With look "field": the label, then the icon on
//          the right.
//   look   "field" to look like the form's text inputs (default: small button)

import { el } from "../lib/dom.js";
import { resizePhoto } from "../lib/photos.js";

var LOOKS = {
  button: "btn btn-sm photo-pick",
  field: "photo-pick photo-pick-field"
};

export function photoPicker(label, onPhoto, onError, opts) {
  opts = opts || {};
  var input = el("input", { class: "visually-hidden", attrs: { type: "file", accept: "image/*" } });
  input.addEventListener("change", function(){
    var file = input.files && input.files[0];
    if (!file) return;
    resizePhoto(file, opts.size).then(onPhoto).catch(function(){
      onError("That file couldn't be read as a photo. Try a JPEG or PNG.");
    });
  });
  var icon = null;
  if (opts.icon) {
    icon = el("span", { class: "photo-pick-glyph", attrs: { "aria-hidden": "true" } });
    icon.innerHTML = opts.icon;
  }
  if (icon && !opts.look) {
    input.setAttribute("aria-label", label);
    return el("label", { class: "photo-pick photo-pick-icon", attrs: { title: label, "aria-label": label } }, [ input, icon ]);
  }
  return el("label", { class: LOOKS[opts.look] || LOOKS.button }, [
    input,
    el("span", { class: "photo-pick-text", text: label }),
    icon
  ]);
}
