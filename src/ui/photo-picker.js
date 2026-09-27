// A "choose a photo" button: a hidden file input behind a styled label. On
// phones, accept="image/*" offers both the camera and the photo library.
// The chosen file is shrunk (lib/photos.js) before it reaches `onPhoto`;
// pass SCAN_PHOTO as `size` for photos of text that must stay legible.
// With `iconSvg`, the button shows only that icon and `label` becomes its
// accessible name.

import { el } from "../lib/dom.js";
import { resizePhoto } from "../lib/photos.js";

export function photoPicker(label, onPhoto, onError, size, iconSvg) {
  var input = el("input", { class: "visually-hidden", attrs: { type: "file", accept: "image/*" } });
  input.addEventListener("change", function(){
    var file = input.files && input.files[0];
    if (!file) return;
    resizePhoto(file, size).then(onPhoto).catch(function(){
      onError("That file couldn't be read as a photo. Try a JPEG or PNG.");
    });
  });
  if (iconSvg) {
    var icon = el("span", { attrs: { "aria-hidden": "true" } });
    icon.innerHTML = iconSvg;
    input.setAttribute("aria-label", label);
    return el("label", { class: "photo-pick photo-pick-icon", attrs: { title: label, "aria-label": label } }, [ input, icon ]);
  }
  return el("label", { class: "btn btn-sm photo-pick" }, [ input, document.createTextNode(label) ]);
}
