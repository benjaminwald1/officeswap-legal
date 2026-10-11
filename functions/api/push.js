// POST /api/push — push notifications for the iPhone app ("You got Sarah
// Kim's office for Thu, Oct 15"), sent through Firebase Cloud Messaging with
// the project's service account (FIREBASE_SERVICE_ACCOUNT, see billing.js).
//
//   { action: "register", token, code, name, lang? }   this phone belongs to `name` in `code`
//   { action: "unregister", token }             signed out: stop sending to this phone
//   { action: "notify", code, token?, seats: [{ visit, day, name, office, label, officeName?, date? }] }
//        a phone saw these waiting requests get an office; tells each person,
//        except on the phone that reported it (`token`). visit and office
//        are IDs, day is the app's day number (Shards.dayNumber), label is the
//        English text (used when officeName and date, YYYY-MM-DD, aren't sent)
//   { action: "message", code, chat, id, token? }
//        a message was sent (orgs/{code}/chats/{chat}/messages/{id}); it's read
//        from the database and sent to the other person, or to everyone in the
//        organization but the sender; photos and voice notes say so instead
//        of text (Firebase topics the app joins:
//        o_{code} for the organization, p_{code}_{name hash} for the person)
//
// Matching runs on every phone, so several may report the same office:
//   pushTokens/{token}                              code, name, lang, updatedAt
//   pushSent/{code}_{visit}_{day}_{office}          sentAt (created once)
//   pushSent/msg_{code}_{chat}_{id}                 sentAt
// make each one go out once. Neither collection is open to the app (the
// rules don't mention them), only to this service account.

import { accessToken, firestore, getOrg, json, missing, toFields } from "../_lib/billing.js";

const tokenRE = /^[A-Za-z0-9_:\-]{20,400}$/;
const codeRE = /^[A-Za-z0-9]{3,32}$/;
const idRE = /^[A-Za-z0-9\-]{1,64}$/;
const chatRE = /^(all|dm-[0-9a-f]{20})$/;
const msgRE = /^[A-Za-z0-9]{10,40}$/;
const DEMO = "DEMO";

// Notification text in each language the app speaks.
const LANGS = {
  en: { got: "You got an office", for: (o, d) => `${o} for ${d}`, photo: "Sent a photo", voice: "Sent a voice message", locale: "en-US" },
  es: { got: "Tienes una oficina", for: (o, d) => `${o}, el ${d}`, photo: "Envió una foto", voice: "Envió un mensaje de voz", locale: "es-ES" },
  fr: { got: "Vous avez un bureau", for: (o, d) => `${o}, le ${d}`, photo: "A envoyé une photo", voice: "A envoyé un message vocal", locale: "fr-FR" },
  de: { got: "Du hast ein Büro", for: (o, d) => `${o} am ${d}`, photo: "Hat ein Foto gesendet", voice: "Hat eine Sprachnachricht gesendet", locale: "de-DE" },
  pt: { got: "Você tem um escritório", for: (o, d) => `${o} em ${d}`, photo: "Enviou uma foto", voice: "Enviou uma mensagem de voz", locale: "pt-BR" },
  ja: { got: "オフィスが決まりました", for: (o, d) => `${d}：${o}`, photo: "写真を送信しました", voice: "ボイスメッセージを送信しました", locale: "ja-JP" },
  zh: { got: "你有办公室了", for: (o, d) => `${d}：${o}`, photo: "发送了一张照片", voice: "发送了一条语音消息", locale: "zh-CN" },
};

export async function onRequestPost({ request, env }) {
  if (missing(env, ["FIREBASE_SERVICE_ACCOUNT"]).length) return json({ error: "Not set up." }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const s = (v, max) => (typeof v === "string" ? v.trim() : "").slice(0, max);
  const token = s(b.token, 400), code = s(b.code, 32).toUpperCase();

  try {
    if (b.action === "register") {
      const name = s(b.name, 100);
      const lang = LANGS[s(b.lang, 5)] ? s(b.lang, 5) : "en";
      if (!tokenRE.test(token) || !codeRE.test(code) || code === DEMO || !name) return json({ error: "Bad request." }, 400);
      // People this phone blocked: their messages aren't sent to it.
      const blocked = (Array.isArray(b.blocked) ? b.blocked : []).slice(0, 200).map((x) => s(x, 100)).filter(Boolean);
      const r = await firestore(env, "PATCH", `pushTokens/${token}`, { fields: {
        ...toFields({ code, name, lang, updatedAt: new Date() }),
        blocked: { arrayValue: { values: blocked.map((x) => ({ stringValue: x })) } },
      } });
      return r.status === 200 ? json({ ok: true }) : json({ error: "Couldn't save." }, 502);
    }

    if (b.action === "unregister") {
      if (!tokenRE.test(token)) return json({ error: "Bad request." }, 400);
      await firestore(env, "DELETE", `pushTokens/${token}`);
      return json({ ok: true });
    }

    if (b.action === "notify") {
      if (!codeRE.test(code) || code === DEMO || !Array.isArray(b.seats)) return json({ error: "Bad request." }, 400);
      const sent = [];
      let channel; // the Slack or Teams link, looked up once (null: none)
      const today = Math.floor((Date.now() / 1000 - 978307200 + 43200) / 86400);
      const wanted = b.seats.slice(0, 20).map((seat) => ({
        visit: s(seat.visit, 64), office: s(seat.office, 64), day: Number(seat.day),
      })).filter((x) => idRE.test(x.visit) && idRE.test(x.office) && Number.isInteger(x.day) && x.day >= today - 1);
      if (!wanted.length) return json({ ok: true, sent });
      // Only seats the schedule really has: anyone with the code can call
      // this, so nothing a phone says is trusted. The name, office and date
      // come from the database. The reporting phone may not have finished
      // saving yet, so a missing seat is looked for again a little later.
      let found = new Map();
      for (let attempt = 0; attempt < 3; attempt++) {
        const schedule = await loadSchedule(env, code);
        if (!schedule) break;
        found = new Map();
        for (const w of wanted) {
          const v = schedule.visits.get(w.visit);
          const o = schedule.offices.get(w.office);
          if (!v || !o) continue;
          for (let i = 0; i + 1 < v.seats.length; i += 2) {
            if (dayOf(v.seats[i]) === w.day && v.seats[i + 1] === w.office) { found.set(w, { name: v.name, officeName: o.name }); break; }
          }
        }
        if (found.size === wanted.length) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      for (const [w, real] of found) {
        const { visit, office, day } = w;
        const { name, officeName } = real;
        const date = new Date((978307200 + day * 86400) * 1000).toISOString().slice(0, 10);
        const label = officeText("en", officeName, date, "").body;
        const key = `${code}_${visit}_${day}_${office}`;
        const created = await firestore(env, "POST", `pushSent?documentId=${encodeURIComponent(key)}`, { fields: toFields({ sentAt: new Date() }) });
        if (created.status !== 200) continue; // already sent (409) or failed
        const tokens = await tokensFor(env, code, name);
        let n = 0;
        for (const t of tokens) {
          if (t.token === token) continue;
          const text = officeText(t.lang, officeName, date, label);
          if (await send(env, { token: t.token }, text.title, text.body, { code })) n++;
        }
        sent.push({ key, phones: n });
        if (channel === undefined) channel = await channelURL(env, code);
        // In English, not the reporting phone's language (label is written in it).
        if (channel) await postToChannel(channel, `${name} got ${label}`);
      }
      return json({ ok: true, sent });
    }

    if (b.action === "message") {
      const chat = s(b.chat, 30), id = s(b.id, 40);
      if (!codeRE.test(code) || code === DEMO || !chatRE.test(chat) || !msgRE.test(id)) return json({ error: "Bad request." }, 400);
      const path = `orgs/${code}/chats/${chat}`;
      const msg = await firestore(env, "GET", `${path}/messages/${id}`);
      if (msg.status !== 200) return json({ error: "No such message." }, 404);
      const f = msg.data.fields || {};
      const from = (f.from && f.from.stringValue) || "", text = (f.text && f.text.stringValue) || "";
      const kind = (f.kind && f.kind.stringValue) || "";
      const at = Date.parse((f.at && f.at.timestampValue) || "");
      // Only new messages, and each one once.
      if (!from || !(text || kind) || !(Date.now() - at < 10 * 60 * 1000)) return json({ ok: true, sent: 0 });
      const created = await firestore(env, "POST", `pushSent?documentId=${encodeURIComponent(`msg_${code}_${chat}_${id}`)}`, { fields: toFields({ sentAt: new Date() }) });
      if (created.status !== 200) return json({ ok: true, sent: 0 });
      // A photo or voice note has no text: say what it is, in the phone's language.
      const short = text.length > 180 ? `${text.slice(0, 179)}…` : text;
      const bodyFor = (lang) => { const L = LANGS[lang] || LANGS.en;
        return kind === "image" ? "📷 " + (short || L.photo) : kind === "voice" ? L.voice : short; };
      const body = bodyFor("en");
      const data = { code, chat };

      if (chat === "all") {
        const org = await getOrg(env, code);
        const orgName = (org && org.fields && org.fields.name && org.fields.name.stringValue) || "";
        const title = orgName ? `${from} · ${orgName}` : from;
        // Phone by phone when the organization is small enough (each in its
        // language, skipping anyone who blocked the sender); otherwise to the
        // organization's topic, minus the sender.
        const all = (await tokensFor(env, code, null)).filter((t) => t.name !== from && t.token !== token);
        if (all.length <= 40) {
          let n = 0;
          for (const t of all) {
            if (t.blocked.includes(from)) continue;
            if (await send(env, { token: t.token }, title, bodyFor(t.lang), data, chat)) n++;
          }
          return json({ ok: true, sent: n });
        }
        const condition = `'${topic("o", code)}' in topics && !('${await personTopic(code, from)}' in topics)`;
        await send(env, { condition }, title, body, data, chat);
        return json({ ok: true, sent: "topic" });
      }

      const chatDoc = await firestore(env, "GET", path);
      const members = (((chatDoc.data.fields || {}).members || {}).arrayValue || {}).values || [];
      const names = members.map((v) => v.stringValue);
      if (!names.includes(from)) return json({ ok: true, sent: 0 });
      let n = 0;
      for (const name of names.filter((x) => x !== from)) {
        for (const t of await tokensFor(env, code, name)) {
          if (t.token === token || t.blocked.includes(from)) continue;
          if (await send(env, { token: t.token }, from, bodyFor(t.lang), data, chat)) n++;
        }
      }
      return json({ ok: true, sent: n });
    }
  } catch (e) {
    return json({ error: "Something went wrong." }, 500);
  }
  return json({ error: "Bad request." }, 400);
}

// The app's day number for a Swift date (seconds since 2001, counted at noon UTC).
const dayOf = (swift) => Math.floor((Number(swift) + 43200) / 86400);

// The organization's offices and requests (this week and later), from the
// split schedule (see app/shards.js) or the old single document, in one read
// for the layout and one for everything in it.
async function loadSchedule(env, code) {
  const parse = (f) => { try { return JSON.parse(f && f.json && f.json.stringValue); } catch { return null; } };
  const meta = await firestore(env, "GET", `orgs/${code}/state/meta`);
  let docs = [];
  if (meta.status === 200) {
    const m = parse(meta.data.fields);
    if (!m) return null;
    const ids = [];
    for (let i = 0; i < (m.chunks || 0); i++) ids.push(`o${i}`);
    const thisWeek = (() => { const n = Math.floor((Date.now() / 1000 - 978307200 + 43200) / 86400); return n - (((n % 7) + 7) % 7) - 7; })();
    for (const [week, n] of Object.entries(m.weeks || {})) {
      if (Number(week.slice(1)) < thisWeek) continue;
      for (let j = 0; j < n; j++) ids.push(`${week}b${j}`);
    }
    const base = `projects/${JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id}/databases/(default)/documents/orgs/${code}/state`;
    const r = await firestore(env, "POST", ":batchGet", { documents: ids.map((id) => `${base}/${id}`) });
    if (r.status !== 200 || !Array.isArray(r.data)) return null;
    docs = r.data.filter((x) => x.found).map((x) => parse(x.found.fields)).filter(Boolean);
  } else {
    const old = await firestore(env, "GET", `orgs/${code}/state/current`);
    if (old.status !== 200) return null;
    const st = parse(old.data.fields);
    if (st) docs = [st.offices || [], { visits: st.visits || [] }];
  }
  const offices = new Map(), visits = new Map();
  for (const d of docs) {
    if (Array.isArray(d)) for (const o of d) offices.set(o.id, o);
    else for (const v of d.visits || []) visits.set(v.id, v);
  }
  return { offices, visits };
}

// Slack or Teams, if an admin connected a channel (settings/notifySecret).
async function channelURL(env, code) {
  const r = await firestore(env, "GET", `orgs/${code}/settings/notifySecret`);
  return (r.status === 200 && r.data.fields && r.data.fields.url && r.data.fields.url.stringValue) || null;
}
async function postToChannel(url, text) {
  let host;
  try { host = new URL(url).host; } catch { return; }
  // Names and office names come from the phones: in Slack, <, > and & would
  // make links and mentions (<!channel>), so they're sent as plain text.
  const plain = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const message = host === "hooks.slack.com"
    ? { text: `:office: ${plain}` }
    : host.endsWith(".webhook.office.com")
      ? { text }
      // Teams workflows take an Adaptive Card.
      : { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: {
          type: "AdaptiveCard", version: "1.4", body: [{ type: "TextBlock", text, wrap: true }] } }] };
  await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(message) }).catch(() => {});
}

// The phones registered to this person (or, with no name, anyone) in this organization.
async function tokensFor(env, code, name) {
  const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } });
  const filters = name == null ? [eq("code", code)] : [eq("code", code), eq("name", name)];
  const r = await firestore(env, "POST", ":runQuery", {
    structuredQuery: {
      from: [{ collectionId: "pushTokens" }],
      where: { compositeFilter: { op: "AND", filters } },
      limit: name == null ? 200 : 20,
    },
  });
  if (r.status !== 200 || !Array.isArray(r.data)) return [];
  return r.data.filter((row) => row.document).map((row) => {
    const f = row.document.fields || {};
    const blocked = ((f.blocked && f.blocked.arrayValue && f.blocked.arrayValue.values) || []).map((v) => v.stringValue);
    return { token: row.document.name.split("/").pop(), name: f.name && f.name.stringValue, lang: (f.lang && f.lang.stringValue) || "en", blocked };
  });
}

// "You got an office" in the person's language.
export function officeText(lang, officeName, date, label) {
  const L = LANGS[lang] || LANGS.en;
  if (!officeName || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { title: L.got, body: label };
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString(L.locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return { title: L.got, body: L.for(officeName, day) };
}

// Firebase topic names (letters, digits, -_.~% only).
function topic(kind, code) { return `${kind}_${code}`; }
async function personTopic(code, name) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
  return `p_${code}_${hex}`;
}

// One notification to one phone ({ token }) or to a topic condition ({ condition });
// a token Firebase no longer knows is removed. Messages of one chat group together.
async function send(env, target, title, body, data, thread) {
  const project = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id;
  const aps = { sound: "default" };
  if (thread) aps["thread-id"] = thread;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken(env)}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { ...target, notification: { title, body }, data, apns: { payload: { aps } } } }),
  });
  if (res.ok) return true;
  // 404 UNREGISTERED: the app was deleted or the token replaced.
  if (res.status === 404 && target.token) await firestore(env, "DELETE", `pushTokens/${target.token}`);
  return false;
}
