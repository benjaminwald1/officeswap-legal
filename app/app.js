// OfficeSwap on the web: the app's Board, Waitlist, Plans and Settings in a
// browser, signed in with the organization's access code. Looks like the
// iPhone app (1.2): black-and-white accent, Export inside Plans.
// Changes go into the same shared schedule every phone uses.

import { Store, Days, officeCount } from "./engine.js?v=4";
import { getOrg, getPhotos, deleteOrg } from "./cloud.js?v=3";
import { Remote } from "./sync.js?v=2";

const root = document.getElementById("root");
const sheet = document.getElementById("sheet");
const SESSION = "officeswap.session";
const nameKey = (code) => `officeswap.myName.${code}`;
const locKey = (code) => `officeswap.boardLocation.${code}`;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

// Icons (SF Symbols look-alikes), drawn with the current text color.
const svg = (d, fill) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="${fill ? "currentColor" : "none"}" stroke="${fill ? "none" : "currentColor"}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  board: svg('<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>', true),
  hourglass: svg('<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 4 5.5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5.5-4 8.5s4 4 4 8.5"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/>'),
  personPlus: svg('<circle cx="10" cy="8" r="3.6"/><path d="M3.5 20c.6-3.6 3.3-5.6 6.5-5.6 1.5 0 2.9.4 4 1.2M18 13.5v6M15 16.5h6"/>'),
  key: svg('<circle cx="8" cy="15" r="4.2"/><path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14.5 8.5l2 2"/>'),
  check: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16.2 9.5"/>'),
  checkFill: svg('<path fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 110 19 9.5 9.5 0 010-19zm4.3 6.4a1 1 0 00-1.4 0L10.7 13l-1.6-1.6a1 1 0 10-1.4 1.4l2.3 2.3a1 1 0 001.4 0l4.9-4.8a1 1 0 000-1.4z"/>', true),
  building: svg('<path d="M5 20.5V5.5a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0115 5.5v15M15 10h3a1.5 1.5 0 011.5 1.5v9M3 20.5h18M8.5 8h3M8.5 11.5h3M8.5 15h3"/>'),
  chevR: svg('<path d="M9 5l7 7-7 7"/>'),
  chevD: svg('<path d="M5 9l7 7 7-7"/>'),
  chevL: svg('<path d="M15 5l-7 7 7 7"/>'),
  note: svg('<path d="M4.5 6.5A2.5 2.5 0 017 4h10a2.5 2.5 0 012.5 2.5v7A2.5 2.5 0 0117 16h-6l-4.5 4v-4A2.5 2.5 0 014.5 13.5z"/>'),
  pin: svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  table: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>'),
  share: svg('<path d="M12 3.5v11M8 7.5l4-4 4 4M6.5 11H6a2 2 0 00-2 2v5.5a2 2 0 002 2h12a2 2 0 002-2V13a2 2 0 00-2-2h-.5"/>'),
  person: svg('<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>'),
  door: svg('<path d="M14 4.5H7.5A1.5 1.5 0 006 6v12a1.5 1.5 0 001.5 1.5H14M10.5 12h10M17.5 8.5L21 12l-3.5 3.5"/>'),
  trash: svg('<path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>'),
  reset: svg('<path d="M4.5 12a7.5 7.5 0 102.2-5.3M4.5 4v4h4"/>'),
  card: svg('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>'),
  megaphone: svg('<path d="M4 10v4a1 1 0 001 1h2.5l7.5 4.5V4.5L7.5 9H5a1 1 0 00-1 1zM7.5 15l1.2 4.5h2.3L10.2 15.6M18 9.5a3.5 3.5 0 010 5"/>'),
  envelope: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.8 6.5l8.2 6.5 8.2-6.5"/>'),
  question: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 114.2 1.8c-.9.7-1.8 1.2-1.8 2.4"/><circle cx="12" cy="16.9" r=".6" fill="currentColor"/>'),
  people: svg('<circle cx="9" cy="8.5" r="3.2"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5M15.5 14.2c2.6-.3 4.8 1.2 5.5 4.3"/>'),
  doc: svg('<path d="M6 3.5h8l4.5 4.5v12a1 1 0 01-1 1H6a1 1 0 01-1-1v-15.5a1 1 0 011-1z"/><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h7"/>'),
  shield: svg('<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12l2.2 2.2 4.3-4.4"/>'),
  instagram: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor"/>'),
  threads: svg('<circle cx="12" cy="12" r="3.6"/><path d="M15.6 12v1.4a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.5 7" stroke-linecap="round"/>'),
};

const S = { code: null, org: null, store: null, version: null, photos: {}, tab: "board", location: null, weekOffset: 0, picked: null, timer: null, orgTimer: null, pushing: false, shut: {}, expanded: new Set(), banner: null, myWaiting: null };

// ---------- helpers ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
const myName = () => { const n = (S.code === "DEMO" ? S.demoName || "" : ls.get(nameKey(S.code)) || "").trim(); return n || null; };
const saveMyName = (n) => { if (S.code === "DEMO") S.demoName = n; else ls.set(nameKey(S.code), n); };

function officePhoto(id) {
  if (S.photos[id]) return S.photos[id];
  const hex = id.replace(/-/g, "");
  let n = 0;
  for (let i = 0; i < 32; i += 2) n = (n * 31 + parseInt(hex.slice(i, i + 2), 16)) & 0xffff;
  return `img/office${(n % 8) + 1}.jpg`;
}
async function personKey(name) {
  const norm = name.toLowerCase().split(" ").filter(Boolean).join(" ");
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm)));
  return "person-" + [...d.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const personKeys = new Map();
function avatar(name, cls = "") {
  const key = personKeys.get(name);
  if (key === undefined) { personKeys.set(name, null); personKey(name).then((k) => { personKeys.set(name, k); if (S.photos[k]) render(); }); }
  const photo = key && S.photos[key];
  const palette = ["#0a84ff", "#30b0c7", "#5856d6", "#ff9500", "#ff2d55", "#34c759", "#af52de", "#a2845e"];
  let n = 0; for (const ch of name.toLowerCase()) n = (n * 31 + ch.codePointAt(0)) & 0xffff;
  const tint = palette[n % 8];
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return photo
    ? `<span class="av ${cls}"><img src="${photo}" alt=""></span>`
    : `<span class="av ${cls}" style="color:${tint};background:color-mix(in srgb, ${tint} 16%, transparent)" aria-hidden="true">${esc(initials)}</span>`;
}

// ---------- billing (paid organizations; others are free) ----------

const billing = () => (S.org && S.org.plan ? { plan: S.org.plan, limit: S.org.officeLimit ?? null, status: S.org.billingStatus || "active" } : null);
const planName = (p) => ({ starter: "Starter", growth: "Growth", enterprise: "Enterprise" }[p] || p);
const isActive = (b) => !b || ["trialing", "active"].includes(b.status);
const paymentFailed = (b) => !!b && ["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(b.status);
function blockedMessage(b, name) {
  return paymentFailed(b)
    ? `The card on file for ${name} was declined, so its OfficeSwap subscription is on hold. Whoever set up OfficeSwap for ${name} needs to update the payment method at officeswap.co/account. You'll be able to continue as soon as the payment goes through.`
    : `${name}'s OfficeSwap subscription has ended. Its offices and schedule are kept safe. Whoever set it up can renew at officeswap.co/account.`;
}

// ---------- admin code (same PBKDF2 as the app) ----------

async function masterMatches(code) {
  if (!S.org.masterHash || !S.org.masterSalt) return true;
  const salt = Uint8Array.from(atob(S.org.masterSalt), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code.trim()), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, key, 256));
  let s = ""; bits.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s) === S.org.masterHash;
}
function askMaster(title, message, then) {
  openSheet(title, `
    <p class="foot" style="margin-top:0">${esc(message)}</p>
    <input class="field" id="mc" type="password" autocomplete="off" placeholder="Admin code" style="margin-top:12px">
    <p class="err" id="mc-err" hidden>That's not the admin code.</p>
    <button class="primary" id="mc-go">Continue</button>`, () => {
    const go = sheet.querySelector("#mc-go"), input = sheet.querySelector("#mc");
    input.focus();
    const run = async () => {
      go.disabled = true;
      if (await masterMatches(input.value)) { closeSheet(); then(); }
      else { sheet.querySelector("#mc-err").hidden = false; go.disabled = false; }
    };
    go.onclick = run; input.onkeydown = (e) => { if (e.key === "Enter") run(); };
  });
}

// ---------- the demo organization ----------
// Northwind Partners, code DEMO: anyone can try OfficeSwap with it. It lives
// only in this page: nothing is saved or shared, and closing the page (or
// leaving it for a while) signs out and throws away whatever was changed.

const DEMO = "DEMO";
const DEMO_ORG = { name: "Northwind Partners", address: { street: "100 Park Avenue", city: "New York", state: "NY", zip: "10017" } };
const isDemo = () => S.code === DEMO;

// Someone's waiting request just got an office: officeswap.co sends their
// iPhones a notification (once, however many phones and browsers report it).
function reportSeats(code, seats) {
  const short = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const body = seats.slice(0, 20).map(({ visit, day, office }) => {
    const o = S.store && S.store.office(office);
    // The app's day number: days since 2001, counted at noon UTC.
    const n = Math.floor((day.getTime() / 1000 - 978307200 + 43200) / 86400);
    return o && { visit: visit.id, day: n, office, name: visit.name, label: `${o.name} for ${short(day)}` };
  }).filter(Boolean);
  if (!body.length) return;
  fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "notify", code, seats: body }) }).catch(() => {});
}
function demoStore() {
  const st = new Store(DEMO, DEMO_ORG.name, DEMO_ORG.address);
  const owners = ["Priya Shah", "Marcus Chen", "Elena Rossi", "David Okafor", "Sarah Kim", "Tom Becker", "Aisha Rahman", "Luis Ortega", "Hannah Weiss", "James Carter"];
  st.setOffices(owners.map((o, i) => `${o}'s office, ${o}, New York, 100 Park Avenue, Floor ${10 + i}, New York, NY 10017`).join("\n"));
  for (const v of ["Nina Patel", "Ben Adler", "Chloe Martin", "Omar Haddad", "Grace Liu", "Jordan Lee", "Maya Singh"]) st.addPerson(v);
  const d = Days.upcoming(5), id = (o) => st.offices.find((x) => x.owner === o).id;
  st.addAway(id("Priya Shah"), d.slice(0, 3), "At the Boston conference");
  st.addAway(id("Marcus Chen"), d.slice(0, 3), "");
  st.addAway(id("Elena Rossi"), d.slice(0, 2), "Working from home");
  st.addAway(id("Sarah Kim"), [d[0]], "");
  st.addAway(id("David Okafor"), [d[0], d[1]], "");
  for (const [n, days] of [["Nina Patel", [d[0], d[1]]], ["Ben Adler", [d[0], d[1], d[2]]], ["Chloe Martin", [d[0]]], ["Omar Haddad", [d[0], d[1]]], ["Grace Liu", [d[3], d[4]]]]) st.addVisit(n, days, null);
  st.pending.length = 0;
  return st;
}
// Stands in for the cloud: changes stay on the page.
const localRemote = (store) => ({ refresh: async () => false, push: async () => { store.pending.length = 0; return true; } });
let demoHiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (!isDemo()) return;
  if (document.hidden) demoHiddenAt = Date.now();
  else if (demoHiddenAt && Date.now() - demoHiddenAt > 5 * 60 * 1000) { toast("The demo was reset."); signOut(); }
});

// ---------- sync ----------

async function refresh() {
  if (!S.store) return;
  try {
    if (await S.remote.refresh()) {
      if (S.store.pending.length) return push();
      render();
    }
  } catch (e) {
    // Offline: try again next tick. Only say something if the data itself is the problem.
    if (e.message && e.message.startsWith("This organization")) toast(e.message);
  }
}
async function refreshOrg() {
  if (isDemo()) return;
  try {
    const org = await getOrg(S.code);
    if (!org) { toast(`${S.org.name} was deleted.`); return signOut(); }
    const changed = JSON.stringify(org) !== JSON.stringify(S.org);
    S.org = org; if (changed) render();
    S.photos = await getPhotos(S.code).catch(() => S.photos); render();
  } catch {}
}
// Sends this page's changes: read the latest, merge them on top, write if
// nobody else wrote in between (otherwise read again and retry).
async function push() {
  if (S.pushing) { S.pushAgain = true; return; }
  S.pushing = true;
  try {
    do { S.pushAgain = false; await S.remote.push(); } while (S.pushAgain && S.store.pending.length);
    if (S.store.pending.length) toast("Couldn't save yet. Retrying…");
  } catch (e) { toast(e.message); }
  finally { S.pushing = false; render(); if (S.store.pending.length) setTimeout(push, 4000); }
}

// ---------- sign in ----------

function showGate(error = "") {
  stopTimers();
  root.innerHTML = `
  <div class="gate"><form class="gate-in" id="gate">
    <img src="../logo.png" alt="">
    <h1>OfficeSwap</h1>
    <p>Enter your organization's access code</p>
    <input id="code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Code" aria-label="Access code">
    <p class="err" id="err" ${error ? "" : "hidden"}>${esc(error)}</p>
    <button class="go" id="go" disabled>Continue</button>
    <div class="or"><span></span><small>or</small><span></span></div>
    <a class="reg" href="../start/">Register an organization</a>
    <p class="fine">By continuing, you agree to the <a href="../terms/">Terms of Service</a> and <a href="../privacy/">Privacy Policy</a>.</p>
  </form></div>`;
  const input = root.querySelector("#code"), go = root.querySelector("#go");
  input.focus();
  input.oninput = () => { go.disabled = !input.value.trim(); root.querySelector("#err").hidden = true; };
  root.querySelector("#gate").onsubmit = async (e) => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,12}$/.test(code)) return showGate("Invalid access code");
    if (code === DEMO) return open(DEMO, DEMO_ORG);
    go.disabled = true; go.textContent = "Checking…";
    try {
      const org = await getOrg(code);
      if (!org) return showGate("Invalid access code");
      const b = org.plan ? { plan: org.plan, status: org.billingStatus || "active" } : null;
      if (!isActive(b)) return showGate(blockedMessage(b, org.name));
      ls.set(SESSION, code);
      open(code, org);
    } catch (x) { showGate(x.message); }
  };
}

async function open(code, org) {
  if (code === DEMO) {
    S.code = DEMO; S.org = DEMO_ORG; S.store = demoStore(); S.remote = localRemote(S.store); S.photos = {};
    S.loaded = true; S.version = null; S.tab = "board"; S.weekOffset = 0; S.picked = null; S.shut = {}; S.expanded = new Set(); S.banner = null; S.myWaiting = null;
    S.location = null; stopTimers(); demoHiddenAt = 0; render(); return;
  }
  S.code = code; S.org = org || (await getOrg(code));
  if (!S.org) { ls.set(SESSION, null); return showGate(); }
  S.store = new Store(code, S.org.name, S.org.address || null);
  S.store.onNewSeats = (seats) => reportSeats(code, seats);
  S.remote = new Remote(code, S.store);
  S.loaded = false; S.version = null; S.tab = "board"; S.weekOffset = 0; S.picked = null; S.shut = {}; S.expanded = new Set(); S.banner = null; S.myWaiting = null;
  S.location = ls.get(locKey(code));
  root.innerHTML = `<div class="paused"><p class="muted">Loading ${esc(S.org.name)}…</p></div>`;
  await refresh();
  render();
  S.photos = await getPhotos(code).catch(() => ({})); render();
  stopTimers();
  S.timer = setInterval(() => { if (!document.hidden) refresh(); }, 8000);
  S.orgTimer = setInterval(() => { if (!document.hidden) refreshOrg(); }, 45000);
  if (!myName()) askName(true);
}
function stopTimers() { clearInterval(S.timer); clearInterval(S.orgTimer); }
function signOut() { stopTimers(); ls.set(SESSION, null); S.store = null; S.code = null; S.demoName = null; closeSheet(); showGate(); }
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.store) refresh(); });

// ---------- "What's your name?" ----------

function askName(first) {
  openSheet(first ? "Your name" : "Your name", `
    <p style="margin:0 4px 4px;font-weight:600">${first ? `Welcome to ${esc(S.org.name)}. ` : ""}What's your name?</p>
    <p class="foot" style="margin-top:0">Type your name so OfficeSwap can fill it in whenever you request or offer an office. It's shown only to people in ${esc(S.org.name)}.</p>
    <input class="field" id="nm" autocomplete="name" placeholder="Your full name" style="margin-top:14px" value="${esc(myName() || "")}">
    <div class="suggest" id="sg"></div>
    <button class="primary" id="nm-go">${first ? "Continue" : "Save"}</button>
    ${first ? `<button class="link-btn" style="color:var(--muted);width:100%;margin-top:8px" id="nm-skip">Not now</button>` : ""}`, () => {
    const input = sheet.querySelector("#nm"), go = sheet.querySelector("#nm-go"), sg = sheet.querySelector("#sg");
    const clean = () => input.value.split(" ").filter(Boolean).join(" ");
    const upd = () => {
      const t = clean().toLowerCase();
      go.disabled = clean().length < 2;
      const people = t ? S.store.peopleDirectory().filter((p) => p.toLowerCase().includes(t) && p.toLowerCase() !== t).slice(0, 5) : [];
      sg.innerHTML = people.map((p) => `<button type="button">${esc(p)}</button>`).join("");
      sg.querySelectorAll("button").forEach((b, i) => (b.onclick = () => { input.value = people[i]; upd(); }));
    };
    input.oninput = upd; upd(); input.focus();
    const save = () => {
      const n = clean(); if (n.length < 2) return;
      const existing = S.store.peopleDirectory().find((p) => p.toLowerCase() === n.toLowerCase());
      const final = existing || n;
      if (!existing) { S.store.addPerson(final); push(); }
      saveMyName(final); closeSheet(); render();
    };
    go.onclick = save; input.onkeydown = (e) => { if (e.key === "Enter") save(); };
    const skip = sheet.querySelector("#nm-skip"); if (skip) skip.onclick = closeSheet;
  });
}

// ---------- sheets ----------

function openSheet(title, body, setup, right) {
  sheet.innerHTML = `<div class="sheet"><div class="sheet-head"><button id="sh-x">${right ? "Cancel" : "Close"}</button><h3>${esc(title)}</h3>${right ? `<button id="sh-r">${esc(right)}</button>` : `<span style="min-width:70px"></span>`}</div><div class="sheet-body">${body}</div></div>`;
  sheet.querySelector("#sh-x").onclick = closeSheet;
  if (!sheet.open) sheet.showModal();
  if (setup) setup();
}
function closeSheet() { if (sheet.open) sheet.close(); }

function calendar(selected, onChange) {
  // the next eight weeks of weekdays, from this Monday
  const start = Days.monday(Days.today()), today = Days.today();
  let html = "", month = "";
  for (let w = 0; w < 8; w++) {
    const days = Days.weekDates(Days.add(start, w * 7));
    const m = days[0].toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (m !== month) {
      if (month) html += "</div>";
      month = m;
      html += `<div class="cal-month">${esc(m)}</div><div class="cal-grid">${["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => `<span class="h">${d}</span>`).join("")}`;
    }
    for (const d of days) {
      const past = d < today;
      html += `<button type="button" data-k="${d.getTime()}" ${past ? "disabled" : ""} class="${selected.has(d.getTime()) ? "on" : ""}">${d.getDate()}</button>`;
    }
  }
  html += "</div>";
  return { html, wire(container) {
    container.querySelectorAll(".cal-grid button[data-k]").forEach((b) => (b.onclick = () => {
      const k = Number(b.dataset.k);
      selected.has(k) ? selected.delete(k) : selected.add(k);
      b.classList.toggle("on"); onChange();
    }));
  } };
}

function requestSheet() {
  const locs = S.store.locations();
  let location = locs.includes(S.location) ? S.location : locs[0] ?? null;
  const picks = new Set();
  let name = "";
  const names = () => S.store.requestableNames(locs.length ? location : null);
  const draw = () => {
    const list = names();
    if (!name && myName() && list.includes(myName())) name = myName();
    if (name && !list.includes(name)) name = "";
    const days = [...picks].map((k) => new Date(k)).filter(Days.isWeekday).sort((a, b) => a - b);
    const cal = calendar(picks, () => { const n = picks.size; const btn = sheet.querySelector("#rq-go"); btn.textContent = n ? `Request an office for ${n} ${n === 1 ? "day" : "days"}` : "Pick your days above"; btn.disabled = !name || !n; });
    let step = 1;
    openSheet("Request an Office", `
      <div class="card explain"><span class="ic">${I.personPlus}</span><div><b>You need an office</b><div class="small muted">Use this if you need an office for specific days: you don't have one, or you're traveling to another location. If one is free you're assigned right away; otherwise you join the waitlist and get one automatically.</div></div></div>
      ${locs.length > 1 ? `<div class="step">Step ${step++}: Where do you need an office?</div>
        <select class="field" id="rq-loc">${locs.map((l) => `<option ${l === location ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
        <p class="foot">Traveling? Pick the location you're visiting. You can have a request in each location.</p>` : ""}
      <div class="step">Step ${step++}: Who is requesting?</div>
      ${S.store.peopleDirectory().length === 0 ? `<p class="foot">No names yet. Add offices with owners in Settings first.</p>`
        : list.length === 0 ? `<p class="foot">${locs.length > 1 ? `Everyone already has an office or an upcoming request in ${esc(location)}.` : "Everyone already has an upcoming request."}</p>`
        : `<select class="field" id="rq-name"><option value="">Choose a name</option>${list.map((n) => `<option ${n === name ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>`}
      <div class="step">Step ${step++}: Which days do you need an office?</div>
      <div class="card cal" id="rq-cal">${cal.html}</div>
      <p class="foot">Tap each day you'll be in. Weekdays only.</p>
      <button class="primary" id="rq-go" ${!name || !days.length ? "disabled" : ""}>${days.length ? `Request an office for ${days.length} ${days.length === 1 ? "day" : "days"}` : "Pick your days above"}</button>`, () => {
      cal.wire(sheet.querySelector("#rq-cal"));
      const l = sheet.querySelector("#rq-loc"); if (l) l.onchange = () => { location = l.value; draw(); };
      const n = sheet.querySelector("#rq-name"); if (n) n.onchange = () => { name = n.value; sheet.querySelector("#rq-go").disabled = !name || !picks.size; };
      sheet.querySelector("#rq-go").onclick = () => {
        const chosen = [...picks].map((k) => new Date(k)).filter((d) => Days.isWeekday(d) && d >= Days.today()).sort((a, b) => a - b);
        if (!names().includes(name) || !chosen.length) return;
        const id = S.store.addVisit(name, chosen, locs.length ? location : null);
        push();
        showResult(id);
      };
    });
  };
  draw();
}

function showResult(id) {
  const v = S.store.visits.find((x) => x.id === id);
  if (!v) return closeSheet();
  const none = v.seats.size === 0, all = v.seats.size === v.days.length;
  openSheet("", `
    <div class="result"><div class="big ${none ? "no" : "yes"}">${none ? I.hourglass : I.checkFill}</div>
      <h4>${all ? "You have an office" : none ? "You're on the waitlist" : "Partly assigned"}</h4>
      <p class="muted">${none ? `No office is free${v.location ? ` in ${esc(v.location)}` : ""} on your days yet. As soon as someone gives theirs up, you'll be assigned to it automatically.` : all ? "Here's the office you've been assigned for each day." : "You've been assigned an office for some days and are on the waitlist for the rest."}</p></div>
    <div class="card list">${v.days.map((d) => { const o = S.store.office(v.seats.get(Days.key(d))); return `<div class="row"><span class="grow">${esc(Days.short(d))}</span>${o ? `<b class="ok" style="margin:0">${esc(o.name)}</b>` : `<span class="wait" style="margin:0">Waitlisted</span>`}</div>`; }).join("")}</div>
    <button class="primary" id="res-done">Done</button>`, () => { sheet.querySelector("#res-done").onclick = () => { closeSheet(); render(); }; });
}

function offerSheet() {
  const owned = S.store.offerableOffices();
  let officeID = (owned.find((o) => o.owner === myName()) || {}).id || "";
  const picks = new Set();
  const cal = calendar(picks, () => upd());
  const upd = () => { const n = picks.size, b = sheet.querySelector("#of-go"); b.textContent = n ? `Offer my office for ${n} ${n === 1 ? "day" : "days"}` : "Pick your days above"; b.disabled = !officeID || !n; };
  openSheet("Offer My Office", `
    <div class="card explain"><span class="ic">${I.key}</span><div><b>You're offering your office</b><div class="small muted">On the days you're away your office opens up, and the first person on the waitlist is placed in it automatically. You keep it every other day.</div></div></div>
    <div class="step">Step 1: Which office are you offering?</div>
    ${owned.length ? `<select class="field" id="of-office"><option value="">Choose your office</option>${owned.map((o) => `<option value="${o.id}" ${o.id === officeID ? "selected" : ""}>${esc(o.name)}${o.owner ? ` (${esc(o.owner)})` : ""}</option>`).join("")}</select>`
      : `<p class="foot">Every office already has an upcoming offer.</p>`}
    <p class="foot">Offices already offered for upcoming days aren't listed. To change your days, cancel your offer in Plans and make a new one.</p>
    <div class="step">Step 2: Which days will you be away?</div>
    <div class="card cal" id="of-cal">${cal.html}</div>
    <div class="step">Step 3: Note for whoever uses it (optional)</div>
    <input class="field" id="of-note" placeholder="e.g. monitor cable is in the top drawer" maxlength="300">
    <button class="primary" id="of-go" disabled>Pick your days above</button>`, () => {
    cal.wire(sheet.querySelector("#of-cal"));
    const sel = sheet.querySelector("#of-office"); if (sel) sel.onchange = () => { officeID = sel.value; upd(); };
    upd();
    sheet.querySelector("#of-go").onclick = () => {
      const days = [...picks].map((k) => new Date(k)).filter((d) => Days.isWeekday(d) && d >= Days.today());
      if (!officeID || !days.length || !S.store.offerableOffices().some((o) => o.id === officeID)) return;
      S.store.addAway(officeID, days, sheet.querySelector("#of-note").value);
      push(); closeSheet(); toast("Your office is offered."); render();
    };
  });
}

function officeListSheet() {
  openSheet("Office list", `
    <p class="foot" style="margin-top:0">One per line: office, person, location, address. Leave the person blank for a guest desk that's always open, like "Hot desk 3,". ${S.org.address ? `Location and address default to ${esc(S.org.address.city)} and ${esc(`${S.org.address.street}, ${S.org.address.city}, ${S.org.address.state} ${S.org.address.zip}`)}.` : ""}</p>
    <textarea class="field" id="ol" spellcheck="false" style="margin-top:10px">${esc(S.store.officeListText())}</textarea>
    <p class="err" id="ol-err" hidden></p>
    <p class="foot">To scan a printed staff list with your camera, use the iPhone app.</p>`, () => {
    const text = sheet.querySelector("#ol"), err = sheet.querySelector("#ol-err");
    sheet.querySelector("#sh-r").onclick = () => {
      const t = text.value, b = billing(), n = officeCount(t);
      if (b && b.limit != null && n > b.limit && n > S.store.offices.length) {
        err.innerHTML = `Your ${esc(planName(b.plan))} plan covers up to ${b.limit} offices, and this list has ${n}. <a href="../account">Change plan</a>`;
        err.hidden = false; return;
      }
      const e = S.store.validateOffices(t); if (e) { err.textContent = e; err.hidden = false; return; }
      const save = () => { S.store.setOffices(t); push(); closeSheet(); toast("Office list saved."); render(); };
      if (S.org.masterHash && S.store.removesSomething(t)) askMaster("Remove offices or people?", "These changes remove an office or a person. Enter the admin code to save them.", save);
      else save();
    };
  }, "Save");
}

// ---------- screens ----------

function render() {
  if (!S.store) return;
  noticeNewOffice();
  const b = billing();
  const wait = S.store.waitlist().length;
  const tabs = [["board", "Board", I.board], ["waitlist", "Waitlist", I.hourglass], ["plans", "Plans", I.calendar], ["settings", "Settings", I.gear]];
  if (S.tab === "export") S.tab = "plans";
  let body;
  if (!isActive(b)) {
    body = `<div class="paused"><div style="font-size:52px">${paymentFailed(b) ? "💳" : "⏸"}</div><h2 style="margin:0;font:700 24px var(--round)">${paymentFailed(b) ? "Payment declined" : `${esc(S.org.name)} is paused`}</h2>
      <p class="muted" style="max-width:440px;margin:0">${esc(blockedMessage(b, S.org.name))}</p>
      <a class="primary" style="width:auto;padding:14px 28px;text-decoration:none" href="../account">${paymentFailed(b) ? "Update payment method" : "Renew subscription"}</a>
      <button class="link-btn" style="color:var(--accent)" id="sw">Use a different organization</button></div>`;
  } else body = { board, waitlist: waitlistTab, plans, settings }[S.tab]();
  root.innerHTML = `
    <header class="top"><div class="top-in">
      <a class="brand" href="../"><img src="../logo.png" alt=""> OfficeSwap</a>
      <nav class="tabs" role="tablist">${tabs.map(([k, l, ic]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${ic}${l}${k === "waitlist" && wait ? `<span class="badge">${wait}</span>` : ""}</button>`).join("")}</nav>
    </div></header>
    <main class="wrap">${body}</main>
    ${S.banner ? `<div class="banner" id="banner" role="status">${I.checkFill}${esc(S.banner)}</div>` : ""}`;
  const bn = root.querySelector("#banner"); if (bn) bn.onclick = () => { S.banner = null; render(); };
  root.querySelectorAll("[data-tab]").forEach((t) => (t.onclick = () => { S.tab = t.dataset.tab; render(); window.scrollTo(0, 0); }));
  const sw = root.querySelector("#sw"); if (sw) sw.onclick = signOut;
  wire[S.tab] && isActive(b) && wire[S.tab]();
}

function board() {
  const st = S.store, locs = st.locations();
  if (S.location && !locs.includes(S.location)) S.location = null;
  // Start on the location of this person's own office, else the first one.
  if (!S.location) { const mine = st.offices.find((o) => o.owner && o.owner === myName()); S.location = (mine && mine.location) || locs[0] || null; }
  const week = Days.weekDates(Days.add(Days.baseMonday(), S.weekOffset * 7));
  const day = (S.picked && week.some((d) => d.getTime() === S.picked.getTime())) ? S.picked : (week.find((d) => d >= Days.today()) || week[0]);
  const today = Days.today();
  const rows = st.rows(day, S.location);
  const here = st.offices.filter((o) => !S.location || o.location === S.location);
  const waiting = st.visits.filter((v) => v.days.some((d) => d.getTime() === day.getTime()) && !v.seats.has(Days.key(day)) && day >= today)
    .filter((v) => v.location == null || !S.location || v.location === S.location).sort((a, b) => a.created - b.created);
  const orgPhoto = S.photos.org || S.org.photoURL || "img/orgDefault.jpg";
  const open = rows.filter((r) => r.kind === 0), visitors = rows.filter((r) => r.kind === 1), inOffice = rows.filter((r) => r.kind === 2);
  // A group of rows with a header that folds it away; "In the office" starts folded when it's long.
  const group = (key, title, cls, g, startOpen) => {
    const shut = S.shut[key] ?? !startOpen;
    return `<button class="group ${shut ? "shut" : ""}" data-group="${key}">${title} <span class="tag ${cls}">${g.length}</span>${I.chevD}</button>${shut ? "" : g.map(roomRow).join("")}`;
  };
  const weekday = day.toLocaleDateString(undefined, { weekday: "long" });
  return `${isDemo() ? `<div class="demo-banner">${I.board}<div><b>You're trying the demo</b><span>Try anything. Nothing is saved, and you're signed out when you close this page.</span></div></div>` : ""}
    <section class="card org"><img class="ph" src="${esc(orgPhoto)}" alt=""><div><h2>${esc(S.org.name)}</h2>
      ${locs.length ? `<select id="loc" aria-label="Location">${locs.map((l) => `<option ${l === S.location ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}</div></section>
    <div class="actions">
      <button class="action filled" id="act-req"><span class="ic">${I.personPlus}</span><span><b>Request an office</b><span class="sub">Need one on certain days</span></span></button>
      <button class="action plain" id="act-off"><span class="ic">${I.key}</span><span><b>Offer my office</b><span class="sub">Away? Open it up</span></span></button>
    </div>
    <section class="card week">
      <div class="week-head"><b>${week.some((d) => d.getTime() === today.getTime()) ? "This week" : S.weekOffset < 0 ? "Earlier week" : "Coming week"}</b>
        <button id="wk-prev" aria-label="Previous week">${I.chevL}</button><span class="muted small">${esc(Days.short(week[0]))} – ${esc(Days.short(week[4]))}</span><button id="wk-next" aria-label="Next week">${I.chevR}</button></div>
      <div class="days">${week.map((d) => {
        const past = d < today, n = past ? 0 : here.filter((o) => st.isFree(o, d)).length;
        return `<button class="day ${d.getTime() === day.getTime() ? "on" : ""} ${past ? "past" : ""}" data-day="${d.getTime()}"><small>${esc(Days.dow(d))}</small><span class="n">${d.getDate()}</span><span class="free ${n ? "yes" : ""}">${past ? "" : n ? `${n} free` : "Full"}</span></button>`;
      }).join("")}</div>
    </section>
    <div class="section-title" style="font-size:15px;color:var(--muted)">${esc(day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</div>
    ${rows.length ? `
      ${open.length ? group("open", "Available", "open", open, true)
        : day >= today ? `<div class="card nothing"><span class="ic">${I.hourglass}</span><div><b>Nothing free on ${esc(weekday)}</b><span class="small muted">Request an office anyway: you'll get the next one that opens up.</span></div></div>` : ""}
      ${visitors.length ? group("visitor", "Visitors", "visitor", visitors, true) : ""}
      ${inOffice.length ? group("in", "In the office", "in", inOffice, inOffice.length <= 6) : ""}`
      : `<div class="unavailable">${I.building}<p>${st.offices.length ? "No offices match these filters." : "No offices yet. Add them in the Settings tab."}</p></div>`}
    ${waiting.length ? `<div class="section-title" style="color:var(--orange)">${I.hourglass} Waiting for a space</div><div class="card list">${waiting.slice(0, 50).map((v, i) => `<div class="row"><span class="num">${i + 1}</span>${avatar(v.name, "sm")}<b class="grow">${esc(v.name)}</b></div>`).join("")}${waiting.length > 50 ? `<div class="row muted">and ${waiting.length - 50} more</div>` : ""}</div>` : ""}`;
}
function roomRow(r) {
  const status = [["Available", "open"], ["Visitor", "visitor"], ["In office", "in"]][r.kind];
  const who = r.kind === 0 ? r.subtitle : r.kind === 1 ? `${r.title} · ${r.subtitle}` : `${r.title} is in`;
  const note = r.note && r.kind !== 2;
  return `<div class="card room k${r.kind} ${S.expanded.has(r.id) ? "open" : ""}"><button data-room="${esc(r.id)}" aria-expanded="${S.expanded.has(r.id)}">
    <span class="ph"><img class="o" src="${esc(officePhoto(r.id))}" alt="">${r.kind !== 0 ? avatar(r.title, "sm") : ""}</span>
    <span class="grow"><b>${esc(r.name)}</b><span class="who" style="display:block">${esc(who)}</span>
      <span class="tags"><span class="tag ${status[1]}">${status[0]}</span>${note ? `<span class="tag in">${I.note}Note</span>` : ""}</span></span>
    <span class="chev">${I.chevR}</span></button>
    <div class="more">${note ? `<div class="note">${I.note}<span>${esc(r.note)}</span></div>` : ""}
      <div class="meta">${I.pin}<span>${esc(r.location)}</span></div>${r.address ? `<div class="meta">${I.building}<span>${esc(r.address)}</span></div>` : ""}</div></div>`;
}

function waitlistTab() {
  const wl = S.store.waitlist();
  return `<div class="section-title">Waitlist</div>${wl.length ? `<div class="card list">${wl.map((v, i) => `<div class="row"><span class="num">${i + 1}</span>${avatar(v.name)}<div class="grow"><b>${esc(v.name)}</b><span class="small muted">Needs ${esc(Days.range(S.store.waiting(v)))}${v.location ? ` in ${esc(v.location)}` : ""}</span></div></div>`).join("")}</div>
    <p class="foot">First come, first served. People here have no office open on the days they need. They get one automatically as soon as someone offers an office on those days.</p>`
    : `<div class="unavailable">${I.check}<h2>Nobody's waiting</h2><p>Everyone who asked has an office. Away soon? Offer yours and it goes to the next person who needs one.</p><div class="btns"><button class="btn" data-act="offer">Offer my office</button></div></div>`}`;
}

function plans() {
  const t = Days.today();
  const visits = S.store.visits.filter((v) => v.days.some((d) => d >= t)).sort((a, b) => a.created - b.created);
  const trips = S.store.away.filter((a) => a.days.some((d) => d >= t)).sort((a, b) => Math.min(...a.days) - Math.min(...b.days));
  if (!visits.length && !trips.length) {
    return `<div class="section-title">Plans</div><div class="unavailable">${I.calendar}<h2>No plans yet</h2><p>Requests for an office and offices offered for the days someone's away show up here.</p>
      <div class="btns"><button class="btn" data-act="request">Request an office</button><button class="btn ghost" data-act="offer">Offer my office</button></div></div>
      ${exportCard()}`;
  }
  return `<div class="section-title">Plans</div>
    <div class="sec-head">${I.personPlus} Office requests</div>
    ${visits.length ? `<div class="card list">${visits.map((v) => {
      const seated = v.days.filter((d) => v.seats.has(Days.key(d))), waitd = v.days.filter((d) => !v.seats.has(Days.key(d)) && d >= t);
      const offices = [...new Set(seated.map((d) => S.store.office(v.seats.get(Days.key(d)))?.name).filter(Boolean))];
      return `<div class="row">${avatar(v.name)}<div class="grow"><b>${esc(v.name)}</b><span class="small muted">${esc(Days.range(v.days))}${v.location ? ` · ${esc(v.location)}` : ""}</span>
        ${offices.length ? `<div class="small ok">${I.checkFill}${esc(offices.join(", "))}</div>` : ""}${waitd.length ? `<div class="small wait">${I.hourglass}Waitlisted, ${esc(Days.range(waitd))}</div>` : ""}</div>
        <button class="link-btn" data-cancel-visit="${v.id}">Cancel</button></div>`; }).join("")}</div>
      <p class="foot">Cancelling frees any office it was using for the next person on the waitlist.</p>`
      : `<div class="card empty">No office requests yet</div>`}
    <div class="sec-head">${I.key} Offices offered</div>
    ${trips.length ? `<div class="card list">${trips.map((a) => { const o = S.store.office(a.officeID); return `<div class="row">${avatar(o ? o.owner : "?")}<div class="grow"><b>${esc(o ? o.owner : "Unknown")}</b><span class="small muted">${esc(o ? o.name : "Office")} open ${esc(Days.range(a.days))}</span></div><button class="link-btn" data-cancel-away="${a.id}">Cancel</button></div>`; }).join("")}</div>`
      : `<div class="card empty">No offices offered yet</div>`}
    ${exportCard()}`;
}

// The spreadsheet (this used to be its own tab).
function exportCard() {
  return `<div class="sec-head">${I.share} Export</div><div class="card list">
    <button class="setting" id="dl">${I.table}<span class="grow"><b>Download spreadsheet</b><span class="small muted">Everything on the board (offices, who's using them today, the waitlist and offered days) as a CSV file for Excel, Numbers or Google Sheets.</span></span></button></div>`;
}

function settings() {
  const b = billing(), n = myName();
  const jpm = S.code === "JPM" || isDemo();
  return `<div class="section-title">Settings</div>
    <div class="card list">
      <button class="setting" id="st-name">${I.person}<span class="grow">Your name</span><span class="val">${esc(n || "Not set")}</span></button>
      <button class="setting" id="st-offices">${I.building}<span class="grow">Edit office list</span><span class="val">${S.store.offices.length}</span></button>
      ${b ? `<a class="setting" href="../account">${I.card}<span class="grow">${esc(planName(b.plan))} plan${b.status === "trialing" ? " (free trial)" : ""}</span><span class="val">${b.limit != null ? `${S.store.offices.length} of ${b.limit} offices` : `${S.store.offices.length} offices`} ›</span></a>` : ""}
      ${jpm ? "" : `<button class="setting" id="st-reset">${I.reset}<span class="grow">Reset data</span></button>`}
      <button class="setting danger" id="st-switch">${I.door}<span class="grow">Switch organization</span></button>
    </div>
    <p class="foot">${isDemo() ? "This is the demo organization. Nothing you change is saved, and closing this page starts it over." : `Access code: <b>${esc(S.code)}</b>. Changes here show up on everyone's phones within a few seconds. Photos can be changed in the iPhone app.`}</p>
    <div class="section-title" style="margin-top:34px;font-size:15px;color:var(--muted)">Support &amp; Legal</div>
    <div class="card list">${[
      [I.megaphone, "Request a Feature", "mailto:support@officeswap.co?subject=Feature%20request"],
      [I.envelope, "Support Email", "mailto:support@officeswap.co"],
      [I.question, "FAQ", "../faq/"],
      [I.people, "Community Guidelines", "../community-guidelines/"],
      [I.doc, "Terms of Service", "../terms/"],
      [I.shield, "Privacy Policy", "../privacy/"],
    ].map(linkRow).join("")}</div>
    <div class="section-title" style="margin-top:28px;font-size:15px;color:var(--muted)">Follow Us</div>
    <div class="card list">${linkRow([I.instagram, "Instagram", "https://www.instagram.com/officeswap/"]) + linkRow([I.threads, "Threads", "https://www.threads.com/@officeswap"])}</div>
    ${jpm ? "" : `<div class="section-title" style="margin-top:34px"></div><div class="card list"><button class="setting danger" id="st-delete">${I.trash}<span class="grow">Delete organization</span></button></div>
    <p class="foot">Permanently deletes ${esc(S.org.name)} for everyone who uses its access code: offices, schedule, waitlist and photos.${S.org.masterHash ? " Needs the admin code." : ""}</p>`}`;
}

// A Settings row that opens a link: icon, title and a chevron, like the app.
function linkRow([icon, title, href]) {
  const external = href.startsWith("http");
  return `<a class="setting link" href="${href}"${external ? ' target="_blank" rel="noopener"' : ""}>${icon}<span class="grow">${esc(title)}</span><span class="chev">${I.chevR}</span></a>`;
}

const wire = {
  board() {
    const loc = root.querySelector("#loc"); if (loc) loc.onchange = () => { S.location = loc.value; ls.set(locKey(S.code), loc.value); render(); };
    root.querySelector("#act-req").onclick = requestSheet;
    root.querySelector("#act-off").onclick = offerSheet;
    root.querySelector("#wk-prev").onclick = () => { S.weekOffset--; S.picked = null; render(); };
    root.querySelector("#wk-next").onclick = () => { S.weekOffset++; S.picked = null; render(); };
    root.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => { S.picked = new Date(Number(b.dataset.day)); render(); }));
    root.querySelectorAll("[data-group]").forEach((b) => (b.onclick = () => { S.shut[b.dataset.group] = !b.classList.contains("shut"); render(); }));
    root.querySelectorAll("[data-room]").forEach((b) => (b.onclick = () => { const id = b.dataset.room; S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id); render(); }));
  },
  waitlist() { wireActs(); },
  plans() {
    wireActs(); wireExport();
    root.querySelectorAll("[data-cancel-visit]").forEach((b) => (b.onclick = () => { S.store.cancelVisit(b.dataset.cancelVisit); push(); render(); }));
    root.querySelectorAll("[data-cancel-away]").forEach((b) => (b.onclick = () => { S.store.cancelAway(b.dataset.cancelAway); push(); render(); }));
  },
  settings() {
    root.querySelector("#st-name").onclick = () => askName(false);
    root.querySelector("#st-offices").onclick = officeListSheet;
    root.querySelector("#st-switch").onclick = signOut;
    const reset = root.querySelector("#st-reset");
    if (reset) reset.onclick = () => {
      const run = () => { S.store.resetToEmpty(); push(); toast("Data reset."); render(); };
      if (S.org.masterHash) askMaster("Reset data?", "This clears the office list, schedule and waitlist for everyone. Enter the admin code to continue.", run);
      else confirmSheet("Reset data?", "This clears the office list, schedule and waitlist for everyone.", "Reset", run);
    };
    const del = root.querySelector("#st-delete");
    if (del) del.onclick = () => {
      const run = async () => { try { stopTimers(); await deleteOrg(S.code); ls.set(nameKey(S.code), null); toast(`${S.org.name} was deleted.`); signOut(); } catch (e) { toast(e.message); } };
      if (S.org.masterHash) askMaster(`Delete ${S.org.name}?`, "This permanently deletes the organization for everyone. Enter the admin code to continue.", run);
      else confirmSheet(`Delete ${S.org.name}?`, "This permanently deletes the organization for everyone who uses its access code. It can't be undone.", "Delete", run);
    };
  },
};

function wireActs() {
  root.querySelectorAll("[data-act]").forEach((b) => (b.onclick = b.dataset.act === "offer" ? offerSheet : requestSheet));
}
function wireExport() {
  root.querySelector("#dl").onclick = () => {
    const url = URL.createObjectURL(new Blob([S.store.csv()], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `OfficeSwap-${S.code}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
}

// When one of this person's waiting requests gets an office (someone offered
// theirs), say which for a few seconds, like the app's green banner.
function noticeNewOffice() {
  const me = myName();
  if (!S.store || !me) return;
  const today = Days.today(), waiting = new Set(), seated = [];
  for (const v of S.store.visits) {
    if (v.name !== me) continue;
    for (const d of v.days) {
      if (d < today) continue;
      const key = `${v.id}|${Days.key(d)}`, o = v.seats.get(Days.key(d));
      o ? seated.push({ d, o, key }) : waiting.add(key);
    }
  }
  const before = S.myWaiting; S.myWaiting = waiting;
  if (!before) return;
  const first = seated.filter((x) => before.has(x.key)).sort((a, b) => a.d - b.d)[0];
  const office = first && S.store.office(first.o);
  if (!office) return;
  S.banner = `You got ${office.name} for ${Days.short(first.d)}`;
  clearTimeout(S.bannerTimer);
  S.bannerTimer = setTimeout(() => { S.banner = null; render(); }, 4500);
}

function confirmSheet(title, message, action, run) {
  openSheet(title, `<p class="foot" style="margin-top:0;font-size:15px">${esc(message)}</p><button class="primary" id="cf-go" style="background:var(--red)">${esc(action)}</button>`, () => {
    sheet.querySelector("#cf-go").onclick = () => { closeSheet(); run(); };
  });
  return false;
}

// ---------- start ----------

const saved = ls.get(SESSION);
if (saved) open(saved).catch(() => showGate()); else showGate();
