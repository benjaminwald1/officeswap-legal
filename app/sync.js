// Keeps one organization's schedule in step with Firestore for the web app.
//
// Organizations moved to the split layout (shards.js) by the iOS app have a
// state/meta document: then only the documents that changed are fetched,
// and a save rewrites only the documents its changes touch, each on the
// condition that nobody wrote it since it was read. Organizations not moved
// yet still use the single state/current document; the web app never moves
// one itself, so older app versions keep working until 1.2 opens it.

import { Days, trimmed } from "./engine.js?v=4";
import { getState, putState, getDocs, putDocs } from "./cloud.js?v=3";
import { META, MOVED, documentIDs, split, merge, canonical, empty } from "./shards.js?v=1";

const metaKey = (m) => JSON.stringify([m.chunks, Object.entries(m.weeks).sort(), m.knownVisitors, m.rosterVersion ?? null]);

export class Remote {
  constructor(code, store) {
    this.code = code;
    this.store = store;
    this.mode = null;        // "v1" or "v2" once known
    this.version = null;     // v1: the state/current version last read
    this.meta = null;        // v2: the layout
    this.metaTime = null;
    this.docs = {};          // v2: id -> parsed content
    this.times = {};         // v2: id -> updateTime (null: doesn't exist)
    this.loaded = false;
  }

  // Fetches what changed and hands the store the merged schedule. True if
  // anything new arrived.
  async refresh() {
    const head = (await getDocs(this.code, [META]))[META];
    if (!head || head.json == null) return this.refreshV1();
    let meta;
    try { meta = JSON.parse(head.json); } catch { meta = null; }
    if (!meta || meta.v !== 2) throw new Error("This organization was saved by a newer version of OfficeSwap.");
    let changed = this.mode !== "v2" || head.updateTime !== this.metaTime;
    this.mode = "v2"; this.meta = meta; this.metaTime = head.updateTime;
    const ids = documentIDs(meta, true, Days.toSwift(Days.today()));
    const want = new Set(ids);
    for (const id of Object.keys(this.docs)) if (!want.has(id)) { delete this.docs[id]; delete this.times[id]; changed = true; }
    const times = await getDocs(this.code, ids, true);
    const stale = ids.filter((id) => !(id in this.times) || (times[id] ? times[id].updateTime : null) !== this.times[id]);
    if (stale.length) {
      const fresh = await getDocs(this.code, stale);
      for (const id of stale) {
        const d = fresh[id];
        this.times[id] = d ? d.updateTime : null;
        if (d && d.json != null) this.docs[id] = JSON.parse(d.json); else delete this.docs[id];
      }
      changed = true;
    }
    if (changed || !this.loaded) {
      this.loaded = true;
      this.store.adopt(merge(this.meta, this.docs));
      return true;
    }
    return false;
  }

  async refreshV1() {
    const { state, version } = await getState(this.code);
    if (state && state.movedTo) throw new Error("This organization is being updated. Try again in a moment.");
    const changed = this.mode !== "v1" || version !== this.version || !this.loaded;
    this.mode = "v1";
    if (changed) { this.version = version; this.loaded = true; this.store.adopt(state); }
    return changed;
  }

  // Sends this page's changes: read the latest, merge them on top, write if
  // nobody else wrote in between (otherwise read again and retry). True once
  // everything is saved.
  async push() {
    for (let attempt = 0; attempt < 12; attempt++) {
      if (!this.store.pending.length) return true;
      // Someone else saved first: wait a moment (longer each time, a little
      // random so busy pages don't collide again), then read and merge again.
      if (attempt) await new Promise((r) => setTimeout(r, Math.min(3000, 150 * 2 ** Math.min(attempt, 5)) * (0.5 + Math.random())));
      this.attempts = attempt + 1;
      await this.refresh();
      const sent = this.store.pending.length;
      if (!sent) return true;
      if (this.mode === "v1") {
        const { state, version } = await getState(this.code);
        this.store.adopt(state);
        if (await putState(this.code, trimmed(this.store.snapshot()), version)) {
          this.store.pending.splice(0, sent); this.version = null;
        }
        continue;
      }
      const next = split(this.store.snapshot(), this.meta);
      const writes = [];
      for (const id of new Set([...Object.keys(next.docs), ...Object.keys(this.docs)])) {
        if (canonical(id, next.docs[id] ?? empty(id)) !== canonical(id, this.docs[id] ?? empty(id))) {
          writes.push({ id, content: next.docs[id] ?? empty(id) });
        }
      }
      // A document this page never read (an old week, say) is read first, then merged.
      const unread = writes.map((w) => w.id).filter((id) => !(id in this.times));
      if (unread.length) {
        const fresh = await getDocs(this.code, unread);
        for (const id of unread) {
          const d = fresh[id];
          this.times[id] = d ? d.updateTime : null;
          if (d && d.json != null) this.docs[id] = JSON.parse(d.json);
        }
        continue;
      }
      const put = writes.map((w) => ({ id: w.id, json: JSON.stringify(w.content), updateTime: this.times[w.id] }));
      if (metaKey(next.meta) !== metaKey(this.meta)) put.push({ id: META, json: JSON.stringify(next.meta), updateTime: this.metaTime });
      this.lastWrites = put.length;
      if (!put.length || await putDocs(this.code, put)) {
        this.store.pending.splice(0, sent);
        // Keep what was written; its new times come with the next refresh.
        for (const w of writes) { this.docs[w.id] = w.content; this.times[w.id] = "written"; }
        if (put.some((p) => p.id === META)) { this.meta = next.meta; this.metaTime = "written"; }
      }
    }
    return !this.store.pending.length;
  }
}

export { MOVED };
