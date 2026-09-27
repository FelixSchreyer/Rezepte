// Sign-in / create-account screen, shown whenever nobody is signed in.
// Creating an account does not grant access — it leads to onboarding and
// then to the "waiting for approval" screen until an admin lets them in.

import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { Backend } from "../backend/index.js";
import { afterSignedIn } from "../boot.js";
import { render } from "./app.js";

var ERRORS = {
  invalid: "Wrong email or password.",
  exists: "There is already an account with this email. Sign in instead.",
  weak: "The password needs at least 6 characters.",
  confirm: "Your account was created, but this Supabase project still requires email confirmation. An admin needs to switch off \"Confirm email\" (Authentication → Sign In / Providers → Email).",
  network: "Couldn't reach the server — check your connection and try again."
};

export function renderAuth() {
  var a = state.auth;
  var signingUp = a.mode === "signup";

  var email = el("input", { attrs: { type: "email", name: "email", autocomplete: "email", required: "", placeholder: "you@example.com" } });
  email.value = a.email;
  email.addEventListener("input", function(e){ a.email = e.target.value; });

  var password = el("input", { attrs: {
    type: "password", name: "password", required: "", minlength: "6",
    autocomplete: signingUp ? "new-password" : "current-password"
  } });
  password.value = a.password;
  password.addEventListener("input", function(e){ a.password = e.target.value; });

  var form = el("form", { class: "auth-form", attrs: { novalidate: "" }, on: { submit: function(e){ e.preventDefault(); submitAuth(); } } }, [
    el("label", { class: "field" }, [ el("span", { class: "lbl", text: "Email" }), email ]),
    el("label", { class: "field" }, [
      el("span", { class: "lbl" }, [
        document.createTextNode("Password "),
        signingUp ? el("span", { class: "hint", text: "— at least 6 characters" }) : null
      ]),
      password
    ]),
    a.error ? el("div", { class: "form-error", text: a.error }) : null,
    el("button", {
      class: "btn btn-primary btn-block", attrs: a.busy ? { type: "submit", disabled: "" } : { type: "submit" },
      text: a.busy ? "One moment…" : (signingUp ? "Create account" : "Sign in")
    })
  ]);

  var toggle = el("p", { class: "auth-toggle" }, [
    document.createTextNode(signingUp ? "Already have an account? " : "New here? "),
    el("button", { class: "link-btn", attrs: { type: "button" }, text: signingUp ? "Sign in" : "Create an account", on: { click: function(){
      a.mode = signingUp ? "signin" : "signup";
      a.error = "";
      render();
    } } })
  ]);

  return el("div", { class: "center-screen" }, [
    el("div", { class: "box auth-box" }, [
      el("h2", { text: "Gut & Grain" }),
      el("p", { text: signingUp
        ? "Create an account, then an admin of the family's recipe box lets you in."
        : "Sign in to your family's recipe box." }),
      form,
      toggle
    ])
  ]);
}

export async function submitAuth() {
  var a = state.auth;
  var email = a.email.trim();
  if (!email || email.indexOf("@") === -1) { a.error = "Please enter your email address."; render(); return; }
  if (!a.password) { a.error = "Please enter a password."; render(); return; }

  a.error = "";
  a.busy = true;
  render();

  var res = a.mode === "signup"
    ? await Backend.signUp(email, a.password)
    : await Backend.signIn(email, a.password);

  a.busy = false;
  if (res.error) {
    a.error = ERRORS[res.error] || ERRORS.network;
    render();
    return;
  }
  a.password = "";
  await afterSignedIn(res.uid);
}
