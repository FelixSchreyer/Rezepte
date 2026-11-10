// Service worker — for the daily check-in reminder only.
//
// Deliberately no fetch handler: nothing is cached, pages, scripts and
// styles keep loading straight from the network as they did before this
// file existed. It is registered only when a patient turns reminders on
// (src/lib/push.js); the daily-checkin Edge Function sends the messages.

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });

// iOS withdraws push permission from a page that receives a push without
// showing a notification, so one is always shown.
self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* show the default text */ }
  event.waitUntil(self.registration.showNotification(data.title || "How are you today?", {
    body: data.body || "One tap — it helps to see what agrees with you.",
    icon: "icons/apple-touch-icon.png",
    tag: "daily-checkin",
    data: { day: data.day || "" }
  }));
});

// Opens the check-in: in the app if it is already open, otherwise by
// starting it at ?checkin=<day> (see takeCheckinParam() in src/boot.js).
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var day = (event.notification.data && event.notification.data.day) || "";
  var url = self.registration.scope + (day ? "?checkin=" + day : "");
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    var client = list[0];
    if (client) {
      client.postMessage({ type: "checkin", day: day });
      return client.focus();
    }
    return self.clients.openWindow(url);
  }));
});
