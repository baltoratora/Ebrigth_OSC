// Collapse duplicate recruit cards that belong to the SAME person into one.
//
// A candidate who fills the "Join the Team" form more than once (e.g. for two
// different positions) creates one career_application — and therefore one
// rec_recruit card — per submission. The board should show that person ONCE,
// with every position they applied for listed on the single card.
//
// Two cards are the same person when they share a normalised phone OR a
// lowercased email. We union those together (so A↔B by phone and B↔C by email
// puts A, B, C in one group even when A and C share nothing directly). Cards
// with neither phone nor email are always their own group — we never merge
// distinct people just because contact info is missing.

export interface PersonRow {
  id: string;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  hired?: boolean;
  /** Pipeline order of the card's stage — higher = further along. */
  stageOrder: number;
  /** Tie-break when two cards are equally advanced — higher wins (newer). */
  sortKey: number;
}

export interface PersonGroup<T extends PersonRow> {
  /** The card that represents this person on the board (most advanced stage). */
  rep: T;
  /** All cards that were merged into this person (incl. the rep). */
  members: T[];
  /** Distinct positions applied for, across every member. */
  positions: string[];
  /** True if ANY member is matched/hired. */
  hired: boolean;
}

/** Normalise a phone the same way the rest of the app does. */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const core = String(raw).replace(/[^0-9]/g, "").replace(/^(60)?0*/, "");
  return core || null;
}
function emailKey(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase();
  return e || null;
}

/** Minimal union-find over string keys. */
class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Group rows by person and pick a representative + merged positions for each. */
export function groupPeople<T extends PersonRow>(rows: T[]): PersonGroup<T>[] {
  const uf = new UnionFind();
  // Connect every row's id to its phone/email tokens (namespaced so a phone that
  // looks like an email can't collide).
  for (const r of rows) {
    const node = `r:${r.id}`;
    uf.find(node);
    const ph = phoneKey(r.phone);
    const em = emailKey(r.email);
    if (ph) uf.union(node, `p:${ph}`);
    if (em) uf.union(node, `e:${em}`);
  }

  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const root = uf.find(`r:${r.id}`);
    const list = groups.get(root) ?? [];
    list.push(r);
    groups.set(root, list);
  }

  const out: PersonGroup<T>[] = [];
  for (const members of groups.values()) {
    // Representative: furthest-along stage, then newest.
    const rep = members.reduce((best, cur) => {
      if (cur.stageOrder !== best.stageOrder) return cur.stageOrder > best.stageOrder ? cur : best;
      return cur.sortKey > best.sortKey ? cur : best;
    });
    const positions: string[] = [];
    const seen = new Set<string>();
    // List the rep's position first, then the rest, de-duplicated.
    for (const m of [rep, ...members]) {
      const p = m.position?.trim();
      if (p && !seen.has(p.toLowerCase())) {
        seen.add(p.toLowerCase());
        positions.push(p);
      }
    }
    out.push({ rep, members, positions, hired: members.some((m) => m.hired) });
  }
  return out;
}
