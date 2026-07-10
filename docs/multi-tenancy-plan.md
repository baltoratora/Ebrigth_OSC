# Multi-Tenancy / SaaS Plan — Project Brief & Implementation Prompts

> **Purpose of this document.** It is a self-contained briefing so that *any* future
> session (including a brand-new Claude session with zero prior context) can pick up
> the multi-tenancy work, understand the project, the objectives, the architecture
> we already agreed on, and — above all — implement it **without breaking the live
> Ebright CRM**. Hand Claude this file (or the relevant section) and the prompts
> below are ready to paste.
>
> Authored 2026-06-13. Status: **design only — no tenancy code written yet.**

---

## 0. How to use this document

1. Start a session with: *"Read `docs/multi-tenancy-plan.md` in full before doing anything. We are implementing the multi-tenancy plan it describes. Confirm you understand the §3 non-negotiable constraints before proposing changes."*
2. Then paste the **Phase prompt** (see §9) for whichever phase you want to do.
3. Always work on the `staging` branch, get it reviewed, then merge to `main` (which auto-deploys to production). Never run destructive DB operations against the live Ebright database.
4. This is a **big, multi-phase** effort. Do **one phase at a time**, verify it, and only then move on.

---

## 1. What this project is (context for a fresh session)

**The app** is "Ebright OSC" — a Next.js 15 (App Router) + TypeScript + Prisma 6.19 + Tailwind v4 monorepo for Ebright Sdn. Bhd. (a Malaysian education company). It bundles several modules in one codebase:

- **CRM** (`/crm/*`) — leads, contacts, opportunities kanban, dashboards, tickets, forms. **This is the module we are turning into a SaaS product.**
- **FA-system, PCM-system, manpower scheduling, HRMS** — Ebright-internal operations modules. **These are NOT part of the SaaS product and must never be exposed to external tenants.**

**Stack / infra facts:**
- DB: PostgreSQL on a server at `103.209.156.174:5433`, database `ebright_crm`, Prisma `schema=crm`. Connection string in `DATABASE_URL`.
- A second Postgres DB `ebrightleads_db` (`LEADS_DB_URL`) feeds Ebright's lead ingest — **Ebright-specific, not for tenants.**
- Prisma client is created with a **runtime** connection URL: `new PrismaClient({ datasourceUrl })` in `lib/crm/db.ts` and `lib/prisma.ts`. **This is the key enabler for per-tenant database routing** — the URL is not baked into the schema.
- `prisma.config.ts` holds `datasource.url`; `prisma/schema.prisma` *also* still needs `url = env("DATABASE_URL")` (Prisma 6 requires it; do not remove until a deliberate Prisma 7 upgrade).
- Deploy: GitHub Actions. Push to `main` → `.github/workflows/prod-deploy.yml` SSHes to the server, `git reset --hard origin/main`, rebuilds Docker, restarts containers, reloads nginx. Push to `staging` → staging deploy + Playwright smoke. **Pushing to a branch is enough; the server pulls itself. The laptop is not involved.**

**The CRM is already multi-tenant at the data layer:**
- A `crm_tenant` table exists; **every CRM table carries a `tenantId`**.
- All CRM queries go through `scopedPrisma(tenantId)` in `lib/crm/tenancy.ts`, which forces the tenant filter and throws if missing.
- Roles live in `crm_user_branch.role` (enum `CrmUserRole`: `SUPER_ADMIN`, `AGENCY_ADMIN`, `REGIONAL_MANAGER`, `BRANCH_MANAGER`, `BRANCH_STAFF`). Permission logic is in `lib/crm/permissions.ts`. Sidebar/nav is gated by a derived `tktRole` in `app/crm/(protected)/layout.tsx`.
- Auth: `better-auth` (`crm_auth_user`) **plus** an SSO bridge to Ebright's HRMS via NextAuth, wired in `lib/crm/auth.ts`. Support impersonation ("Login As") uses a `crm_preview_user` cookie (see `app/api/crm/preview/*`).

**The single biggest single-tenant assumption to fix:** some `resolveTenantId()` helpers (e.g. in `lib/crm/dashboard-metrics.ts`) look up the tenant by hardcoded slug `'ebright'` / `'ebright-demo'` and ignore the logged-in user. These must derive the tenant from the **session/subdomain** instead.

---

## 2. The objective / vision

Turn the CRM into a multi-tenant SaaS where external companies subscribe and run their own isolated CRM. **Ebright becomes just "Tenant #1."** Three layers:

```
PLATFORM LAYER — "super-superadmin" (the landlord / SaaS owner)
  • own login at admin.<domain>  (separate identity realm, NOT a CRM role)
  • manages tenants, plans, billing, status; can impersonate for support
  • has NO CRM data of its own (not a CRM user)
        │ creates / suspends / wipes / impersonates
        ▼
TENANT LAYER — each subscribing company (Ebright, Acme, Beta, …)
  • own branded login page at <subdomain>.<domain>
  • Ebright = SSO via portal (special case); external = standalone email/password
  • starts with an EMPTY opportunity board → builds its own stages + forms
  • gets SUPER_ADMIN + AGENCY_ADMIN accounts within the tenant
        │
        ▼
USER LAYER — the tenant's own users (existing CrmUserRole roles)
```

**Specific product requirements the user stated:**
1. A platform-level "super-superadmin" that manages tenancy and is *not* a CRM user.
2. External tenants get a **separate, branded login page** — not the Ebright portal SSO.
3. New tenant's **Opportunities board is empty**; they create their own pipeline stages.
4. Tenants can **build their own intake forms** (their own customer-detail fields).
5. Each tenant gets **SUPER_ADMIN + AGENCY_ADMIN** account types.
6. **Subscription plans** with different prices unlocking better features.
7. Per-company **customization** via configuration + custom fields (not code forks).
8. **Data isolation per tenant**, with a **GDPR/PDPA wipe** ~6 months after unsubscribe.

---

## 3. NON-NEGOTIABLE CONSTRAINTS — do not compromise the live Ebright CRM

> Ebright is a **production system in daily use across ~23 branches**. Every change in
> this plan must be **additive and reversible**, and must leave Ebright's behaviour
> **byte-for-byte identical** unless a change is explicitly for Ebright.

**Hard rules for any future implementation session:**

1. **Ebright stays put.** Ebright's data remains in the current `ebright_crm` DB on the current server, `schema=crm`. Do **not** migrate, move, or restructure Ebright's data. In the tenant registry, Ebright's row simply points at the current `DATABASE_URL`.
2. **Schema changes are additive only.** New tables (`platform_admin`, `tenant_registry`/extended `crm_tenant`, `tenant_subscription`, `plan_entitlements`, etc.) and **nullable** columns with safe defaults. Never drop/rename/repurpose existing columns that Ebright uses. Apply live ALTERs across the `crm`, `public`, and `old_import` schemas (the established pattern) and run `npx prisma generate`.
3. **Default behaviour = current behaviour.** Introduce tenant resolution and per-tenant connection routing behind a path that, when the registry has only Ebright (or no subdomain matches), behaves exactly as today. If anything is uncertain, **fall back to the Ebright/`DATABASE_URL` path**.
4. **Ebright keeps its auth.** Ebright tenant = `authMode: 'sso'` → keeps the portal/HRMS NextAuth bridge and `crm_preview_user` impersonation untouched. New standalone auth is **only** for external tenants (`authMode: 'standalone'`).
5. **Ebright-only modules stay Ebright-only.** FA-system, PCM-system, manpower, HRMS, and the `ebrightleads_db` lead-ingest worker must be **gated to the Ebright tenant** and never reachable by external tenants. Gating must default to "Ebright sees it; others don't."
6. **Don't break the funnel/hardcoding for Ebright.** `BRANCH_CODES`, `REGIONS`, `STAGE_PATTERN`, `KL_OFFSET_MS`, `DISPLAY_MIN_CREATED_AT`, `ELEVATED_DASHBOARD_EXCLUDE`, MY phone normalization — when these become per-tenant config, **Ebright must keep its exact current values** (seed Ebright's config from today's constants).
7. **Test on `staging` first.** Never run a new/destructive script against the live Ebright DB. Provisioning/wipe jobs must refuse to touch the Ebright tenant.
8. **The wipe job must be impossible to point at Ebright.** Hard-guard: the GDPR wipe can only target tenants with `authMode='standalone'` AND `status='cancelled'` AND past the retention deadline. Ebright is permanently excluded.
9. **Every change must keep `npm run typecheck` clean** (the only known pre-existing errors are `@dnd-kit` module-not-found in the FA/PCM attendance pages — ignore those).
10. **Cross-tenant isolation is the #1 risk.** A bug that shows Company A's data to Company B is catastrophic (and a PDPA/GDPR breach). Prefer the isolation model in §4; add tests that attempt cross-tenant reads and must fail.

---

## 4. Architecture decisions (agreed)

**Isolation model — database-per-tenant, host decided later:**
- Build a **control-plane / tenant registry**: `tenant → connection_url + status + plan + authMode + subdomain + branding`.
- A **per-tenant connection resolver** replaces the single global PrismaClient: given a tenantId, return a cached PrismaClient for that tenant's `connection_url` (LRU cache; evict idle; optionally PgBouncer later).
- **Each external tenant = its own database.** Even before a dedicated server exists, create the tenant's DB as a **separate database on the current server** (`CREATE DATABASE acme;`). This avoids a painful "split a shared table into many DBs" migration later. When capacity/compliance demands, move a tenant by dump→restore→update its `connection_url` (no code change).
- **"Container per tenant"** (a dedicated Postgres container/instance) is an **Enterprise-tier upsell**, not the default. Same registry, the `connection_url` just points at a dedicated instance. Default for small companies = a database on a shared "tenants" Postgres server.
- **"Physical isolation" means a separate database/instance — NOT a NAS.** A Synology-style NAS is only ever a backup target, never the live transactional store. Host tenant DBs on managed Postgres (RDS/Cloud SQL/DO/Supabase/Neon) or a VPS.
- With DB-per-tenant, **cross-tenant leakage is structurally impossible** and Row-Level Security is unnecessary. (If a future decision keeps any tenant on shared DB, add Postgres RLS as a backstop.)

**Build-now-host-later:** the **abstraction** (registry + connection resolver) is what to build now. The physical home of each tenant's DB is a deployment detail behind the `connection_url` and can change per tenant anytime. **The new Postgres server is NOT a prerequisite.**

**Auth realms (three):**
- Platform console → its own login (a `platform_admin` table, separate from `crm_auth_user`; *not* a CrmUserRole). Outside all tenant scoping.
- Ebright tenant → existing portal SSO (`authMode: 'sso'`).
- External tenants → standalone email/password + invites (`authMode: 'standalone'`).

**Tenant resolution:** middleware reads the **subdomain** (`acme.<domain>`) → looks up the registry → sets the tenant + its `connection_url` for the whole request. Ebright maps to its SSO login; others render their branded standalone login.

**Plans & entitlements:**
- `tenant_subscription` (plan, status, seats, periodEnd, gateway IDs).
- `plan_entitlements`: **limits** (max users/contacts/pipelines/API) + **feature flags** (automations, custom forms, analytics, integrations, branding, custom domain, API, isolation tier, support level). DB-backed so pricing changes need no redeploy; allow per-tenant overrides.
- One resolver `getEntitlements(tenantId)` → enforced **server-side** (guards like `requireFeature` / `checkLimit`) AND surfaced in the **UI** (hide/disable + upsell). This mirrors the existing role-gating pattern in `permissions.ts`.
- Billing engine: **Stripe** (global) or a Malaysian gateway (**Billplz/ToyyibPay** for FPX). Webhooks flip `tenant.status`/`plan`; gateway handles trials, proration, dunning.

**Customization = data, not code:**
- Config (stages, forms, branches, lead sources, branding, timezone, currency, labels, email templates) — per-tenant data. Much already exists (`crm_pipeline`/`crm_stage`, `crm_website_form`, settings/pipelines page).
- **Custom fields** — grow `crm_custom_value` (already a tenant/branch-scoped key/value store) into a `crm_custom_field` *definition* table + values, so tenants add their own fields with zero per-tenant code.
- Feature flags per plan; webhooks/API as a power tier.
- **Per-tenant source-code forks are deliberately NOT supported** (kills maintainability). The escape hatch for a customer needing bespoke logic is the Enterprise/dedicated tier.
- Customization depth is itself a **pricing lever** (custom fields on Starter+, branding/custom domain on Pro, API/webhooks on Enterprise).

---

## 5. Data model changes (all additive)

```
NEW    platform_admin         id, email, passwordHash, name, role, createdAt
                              (separate realm; never a CrmUserRole)
EXTEND crm_tenant            + status('trial'|'active'|'suspended'|'cancelled'),
                               authMode('sso'|'standalone'), subdomain (unique),
                               connectionUrl (nullable; null ⇒ use default DATABASE_URL = Ebright),
                               logoUrl, primaryColour, seatLimit, cancelledAt
NEW    tenant_subscription   tenantId, plan, status, seats, periodEnd,
                               gatewayCustomerId, gatewaySubscriptionId
NEW    plan_entitlements     plan, key, kind('limit'|'feature'), value
                               (+ optional tenant_entitlement_override)
GROW   crm_custom_value  →   add crm_custom_field (definitions) for real custom fields
REUSE  crm_pipeline/crm_stage  new tenant starts with ZERO stages
REUSE  crm_website_form        tenant-defined intake fields
REUSE  crm_user_branch.role    SUPER_ADMIN / AGENCY_ADMIN per tenant
REUSE  scopedPrisma + tenantId on every table
```

> Ebright's `crm_tenant` row: `authMode='sso'`, `connectionUrl=null` (⇒ current DB), `status='active'`, excluded from wipe forever.

---

## 6. Lifecycle flows

**Provision a tenant** (transaction / orchestrated job):
```
create crm_tenant (status=trial, authMode=standalone, subdomain)
  → create/point its database (CREATE DATABASE on current server, or dedicated)
  → prisma migrate deploy against that DB
  → seed: first SUPER_ADMIN user (+ invite), one default branch, EMPTY pipeline
  → write registry connection_url
```

**GDPR / PDPA wipe** (scheduled job, hard-guarded):
```
status=cancelled  → start retention timer (e.g. 6 months; offer data export)
  → on deadline AND authMode=standalone AND not Ebright:
       drop database + volume, purge its backups, delete registry row,
       write a deletion audit record
```

---

## 7. The keystone problems (in dependency order)

1. **Tenant resolution** — derive tenant from subdomain/session; kill hardcoded `'ebright'` slug lookups; **fallback to Ebright** when unresolved. *(Nothing else works until this exists; must be a no-op for Ebright.)*
2. **Per-tenant connection router** — registry + LRU PrismaClient cache; Ebright → current `DATABASE_URL`.
3. **De-Ebright-ification** — move hardcoded branches/regions/stages/timezone/currency/phone into per-tenant config, seeding Ebright with today's exact values; gate FA/PCM/manpower/HRMS + lead-ingest to Ebright only.
4. **Platform console + `platform_admin` realm** — list/create/suspend tenants, impersonate, audit.
5. **Standalone tenant auth** — branded login, email/password, invites (external only).
6. **Provisioning automation** — the create-tenant job above.
7. **Plans + entitlements + enforcement** — limits/features, server + UI gating, upsell.
8. **Billing integration** — Stripe/local, webhooks → status/plan.
9. **Custom fields engine** — `crm_custom_field` + values.
10. **GDPR wipe + backup retention** — guarded scheduled job.
11. **Migration orchestrator** — apply schema changes to all tenant DBs with per-DB success tracking. *(Build early; it's the dominant ongoing cost of DB-per-tenant.)*

---

## 8. Phased roadmap

- **Phase 0 — Safety + keystone (no external tenant yet).** Tenant resolution from session/subdomain with Ebright fallback; per-tenant connection router (Ebright → current DB); cross-tenant isolation tests. *Outcome: Ebright unchanged, but the app now routes by tenant.*
- **Phase 1 — One manual pilot tenant.** De-Ebright-ify the must-haves (stages/forms/branding/timezone/currency as per-tenant config; gate Ebright-only modules); minimal platform console (list + create + impersonate); standalone login; provision ONE real external tenant on a subdomain with an empty pipeline; **no billing**. *Outcome: a working two-tenant system, proves isolation in the real world.*
- **Phase 2 — Self-serve + billing.** Signup flow, plans + entitlements + enforcement + upsell, Stripe/local billing + webhooks, generic lead intake (forms/API/CSV), suspend-on-nonpayment.
- **Phase 3 — Customization depth + ops.** Custom-fields engine, per-tenant branding/custom domain, migration orchestrator hardening, monitoring, backups, GDPR wipe job.
- **Phase 4 — Polish / scale.** Enterprise (dedicated DB/container) tier, dedicated tenants Postgres server, region options, admin analytics, docs.

Do **Phase 0 + 1 first** and re-evaluate before investing in billing.

---

## 9. Ready-to-paste prompts (one per phase)

> Each prompt is self-contained. Prepend: *"Read `docs/multi-tenancy-plan.md` first. Obey the §3 non-negotiable constraints — the live Ebright CRM must keep working unchanged. Work on `staging`, keep `npm run typecheck` clean, and propose a plan before editing."*

**Phase 0 prompt:**
> Implement Phase 0 of the multi-tenancy plan: (a) a tenant-resolution layer that derives the current tenant from the request subdomain, falling back to the existing session→`crm_user_branch` path, and finally to the Ebright tenant/`DATABASE_URL` when nothing matches — this MUST be a no-op for Ebright today; (b) replace the single global PrismaClient in `lib/crm/db.ts` with a per-tenant connection resolver backed by a `tenant_registry`/extended `crm_tenant` (Ebright's row → current `DATABASE_URL`), with an LRU cache of clients; (c) add automated tests that attempt cross-tenant reads and must fail. Add only nullable columns/new tables. Do not change Ebright's data or behaviour. Show me the migration + a rollback plan before applying anything to the live DB.

**Phase 1 prompt:**
> Implement Phase 1: de-Ebright-ify the must-have config (pipeline stages already per-tenant; make branches/regions/timezone/currency/phone-format and branding per-tenant settings, seeding Ebright with its current hardcoded values from `lib/crm/dashboard-metrics.ts` etc.); gate the FA-system, PCM-system, manpower, HRMS modules and the `ebrightleads_db` lead-ingest so only the Ebright tenant sees them; build a minimal platform console (`/platform`, behind a new `platform_admin` realm) that lists tenants, creates a tenant (provisioning job: new DB on the current server + migrate + seed first SUPER_ADMIN + one branch + EMPTY pipeline), and supports support-impersonation with audit; add standalone email/password login + invites for `authMode='standalone'` tenants only (Ebright stays on SSO). Provision one test external tenant end-to-end on a subdomain. No billing yet.

**Phase 2 prompt:**
> Implement Phase 2: self-serve signup; `tenant_subscription` + `plan_entitlements` (limits + feature flags) with a `getEntitlements(tenantId)` resolver enforced server-side (`requireFeature`/`checkLimit`) and surfaced in the UI with upsell prompts; integrate billing (Stripe or Billplz/ToyyibPay — ask me which) with webhooks that set tenant status/plan and suspend on non-payment; generic lead intake (public form + API + CSV import) for external tenants.

**Phase 3 prompt:**
> Implement Phase 3: grow `crm_custom_value` into a real custom-fields engine (`crm_custom_field` definitions + values, surfaced on contacts/opportunities and the form builder); per-tenant branding + custom domain; a migration orchestrator that applies schema changes to every tenant DB with per-DB success/failure tracking and resumable partial rollouts; the GDPR/PDPA wipe job (hard-guarded: only `standalone` + `cancelled` + past retention, never Ebright) including backup purge; monitoring + per-tenant backups.

---

## 10. Codebase anchors (where things live)

- Tenant scoping: `lib/crm/tenancy.ts` (`scopedPrisma`).
- Prisma clients (runtime `datasourceUrl`): `lib/crm/db.ts`, `lib/prisma.ts`.
- Tenant resolution to fix (hardcoded slug): `lib/crm/dashboard-metrics.ts` (`resolveTenantId`), and similar helpers in various `app/api/crm/**/route.ts`.
- Auth + SSO bridge + impersonation: `lib/crm/auth.ts`, `app/api/crm/preview/*`, `app/crm/(protected)/layout.tsx` (derives `tktRole`).
- Roles/permissions: `lib/crm/permissions.ts`; enum `CrmUserRole` in `prisma/schema.prisma`.
- Ebright hardcoding to make per-tenant: `lib/crm/dashboard-metrics.ts` (`BRANCH_CODES`, `REGIONS`, `STAGE_PATTERN`, `KL_OFFSET_MS`, `ELEVATED_DASHBOARD_EXCLUDE`, `DISPLAY_MIN_CREATED_AT`), `lib/crm/utils.ts` (`normalizePhone`).
- Lead ingest (Ebright-only): `server/workers/leadIngestWorker.ts`, `lib/crm/leads-import.ts`, `LEADS_DB_URL`.
- Stages/forms self-service: `crm_pipeline`/`crm_stage`, `app/crm/(protected)/settings/pipelines/page.tsx`, `lib/crm/forms-types.ts`, `crm_website_form`.
- Custom fields seed: `crm_custom_value` model in `prisma/schema.prisma`.
- Deploy: `.github/workflows/prod-deploy.yml`, `staging-deploy.yml`.
- Branch/tenant models: `crm_tenant`, `crm_branch`, `crm_user_branch` in `prisma/schema.prisma`.

---

## 11. Business / legal checklist (separate from engineering — not legal advice)

- **IP ownership** — confirm Ebright owns the CRM code and has the right to resell it (employee/contractor IP assignment); audit third-party licenses (stack is permissive/MIT — OK; verify nothing copyleft/paid); do not ship GoHighLevel code/assets/trademarks (inspiration is fine).
- **Data protection** — you become a **data processor**; tenants are controllers. Comply with **Malaysia PDPA 2010 (+2024 amendments)** and **GDPR** for EU-facing tenants. Provide **DPAs**, privacy policy, breach-notification process, right-to-erasure (the wipe job). Note: Ebright data includes **children's data** — sensitive.
- **Contracts** — ToS / subscription agreement, acceptable-use, liability limitation, SLA, payment terms (lawyer-drafted).
- **Tax** — SST on digital services; invoicing; cross-border VAT for foreign customers (accountant).
- **Security duty of care** — DB-per-tenant isolation is the strongest mitigation; breach handling plan.

---

## 12. Open decisions to confirm before/at implementation

1. Target scale — handful of hand-held tenants vs dozens/hundreds (affects automation depth, and DB-per-tenant-on-shared-server vs container).
2. Same repo with a gated `/platform` console, or split the CRM into its own product/repo long-term.
3. Subdomains only (`acme.<domain>`) vs custom domains.
4. Billing provider — Stripe (global cards) vs Billplz/ToyyibPay (Malaysian FPX).
5. Root SaaS domain name (the `<domain>` for `admin.` and `acme.` subdomains).
6. Whether any tenant will contractually require dedicated/physical isolation (drives building the dual-mode registry early).

---

## 13. Glossary

- **Tenant** — one subscribing company (Ebright is Tenant #1).
- **Platform admin / super-superadmin** — the landlord; manages tenants, not CRM data.
- **Entitlement** — what a plan unlocks: a *limit* (number) or a *feature* (on/off).
- **Control plane / registry** — the small DB mapping tenant → connection URL + status + plan.
- **authMode** — `sso` (Ebright/portal) vs `standalone` (external email/password).
- **Database-per-tenant** — each tenant's data in its own Postgres database (logical isolation boundary), hosted on a shared or dedicated server.
- **De-Ebright-ification** — replacing Ebright-hardcoded values/modules with per-tenant config or Ebright-only gating.
```
