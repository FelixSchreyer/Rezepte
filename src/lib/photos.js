// Shrinks a photo in the browser before upload: phone cameras produce
// 3–12 MB images, and a recipe card needs a fraction of that. Keeps the
// free storage quota lasting and uploads fast on mobile data.
//
// createImageBitmap applies the EXIF orientation, so portrait phone photos
// come out upright.

// Dish photos for cards and the detail view.
export var DISH_PHOTO = { maxSide: 1600, quality: 0.82 };
// Photos of a printed or handwritten recipe for the LLM to read: larger and
// sharper, so small print and handwriting stay legible.
export var SCAN_PHOTO = { maxSide: 2400, quality: 0.88 };

export async function resizePhoto(file, opts) {
  opts = opts || DISH_PHOTO;
  var bitmap = await createImageBitmap(file);
  var scale = Math.min(1, opts.maxSide / Math.max(bitmap.width, bitmap.height));
  var w = Math.round(bitmap.width * scale);
  var h = Math.round(bitmap.height * scale);

  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob); else reject(new Error("could not encode photo"));
    }, "image/jpeg", opts.quality);
  });
}

// Base64 without the "data:...;base64," prefix — the form the LLM API
// takes images in.
export function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result).split(",")[1] || ""); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(blob);
  });
}
