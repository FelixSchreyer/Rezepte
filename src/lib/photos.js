// Shrinks a photo in the browser before upload: phone cameras produce
// 3–12 MB images, and a recipe card needs a fraction of that. Keeps the
// free storage quota lasting and uploads fast on mobile data.
//
// createImageBitmap applies the EXIF orientation, so portrait phone photos
// come out upright.

var MAX_SIDE = 1600;
var QUALITY = 0.82;

export async function resizePhoto(file) {
  var bitmap = await createImageBitmap(file);
  var scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
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
    }, "image/jpeg", QUALITY);
  });
}
