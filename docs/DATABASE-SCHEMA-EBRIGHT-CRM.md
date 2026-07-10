# `ebright_crm` — Database Build Sheet

**For:** the engineer creating the new database
**What this is:** the complete list of tables and columns to create for the CRM
system (including the ticketing system) in the **`ebright_crm`** PostgreSQL
database.

## Read this first

- This is a **plain, normal PostgreSQL database.** Every item below is an
  ordinary table. **There are NO foreign tables, NO `postgres_fdw`, NO proxy
  views.** (The old server used FDW to read data from other databases — that is
  exactly what caused the outage, and we are not doing it here.)
- The OSC system uses a **multi-database** layout. Each database has its own
  purpose; the app opens a separate direct connection per database (no FDW,
  no joins across databases). The build sheet below is **only for
  `ebright_crm`** — HR data and lead-source data live in their own DBs.

  | DB | Purpose | App env var | Schema |
  |---|---|---|---|
  | **`ebright_crm`** *(this sheet)* | CRM core + ticketing + audit + auth | `DATABASE_URL` | `crm` |
  | `ebright_hrfs` | HR data — User, BranchStaff, AttendanceLog, AttendanceLogST, LeaveTransaction, MedicalLeave, ManpowerSchedule, Employee | `HRFS_DATABASE_URL` | `public` |
  | `ebrightleads_db` | Upstream lead source + FA system | `LEADS_DB_URL` / `FA_DATABASE_URL` | `public` |

- **Only the data the CRM owns is in `ebright_crm`.** HR operational tables
  (medical leave, attendance, leave, manpower, employee roster, staff
  directory, and the User login table) are **not** in this DB — they live in
  `ebright_hrfs` and the app reads them via a separate Prisma client. See
  [What lives in another database](#what-lives-in-another-database).
- **43 tables total** in `ebright_crm`, grouped into 4 sections.
- All tables go into **one schema** named `crm`.
- **This same sheet builds both PRODUCTION and STAGING.** Both environments use
  the **identical database name `ebright_crm` and identical table names**, on
  **two separate PostgreSQL instances** so they never touch each other (that
  separation is the whole point of the rebuild). See
  [Confirmed decisions](#confirmed-decisions).

---

## Step 0 — Create the database, schema, and enum types

```sql
-- 1. The database
CREATE DATABASE ebright_crm;

-- 2. The schema (all tables live here)
\connect ebright_crm
CREATE SCHEMA IF NOT EXISTS crm;

-- 3. Make the app's role default to this schema
ALTER ROLE <app_user> SET search_path = crm, public;

-- 4. The custom "enum" types used by some columns (create before the tables)
CREATE TYPE "CrmUserRole"           AS ENUM ('SUPER_ADMIN','AGENCY_ADMIN','REGIONAL_MANAGER','BRANCH_MANAGER','BRANCH_STAFF');
CREATE TYPE "TrialDay"              AS ENUM ('WED','THU','FRI','SAT','SUN');
CREATE TYPE "MessageChannel"        AS ENUM ('EMAIL','WHATSAPP','SMS');
CREATE TYPE "MessageDirection"      AS ENUM ('IN','OUT');
CREATE TYPE "CustomValueScope"      AS ENUM ('TENANT','BRANCH');
CREATE TYPE "AutomationTriggerType" AS ENUM ('NEW_LEAD','STAGE_CHANGED','TAG_ADDED','TAG_REMOVED','TIME_IN_STAGE','SCHEDULED','FORM_SUBMITTED','INCOMING_MESSAGE','CUSTOM_FIELD_CHANGED','APPOINTMENT_BOOKED','CONTACT_REPLIED','NO_REPLY_AFTER');
CREATE TYPE "AutomationRunStatus"   AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED');
CREATE TYPE "IntegrationType"       AS ENUM ('META','TIKTOK','WIX','GOOGLE_FORMS','GOOGLE_CALENDAR','OUTLOOK','WEBSITE_FORM');
CREATE TYPE "IntegrationStatus"     AS ENUM ('CONNECTED','DISCONNECTED','ERROR');
CREATE TYPE "WhatsAppProvider"      AS ENUM ('META_CLOUD','TWILIO');
```

### A couple of conventions used in the tables below

- **`id` column.** Every table uses `id TEXT PRIMARY KEY`. The application
  generates the ID (a UUID string), so the database needs **no default** on it.
- **Timestamps.** `createdAt` / `created_at` can default to `now()`.
  `updatedAt` / `updated_at` is set by the application on every change; at the
  database level just make it `NOT NULL` (a `DEFAULT now()` is fine).
- **"Null?" column** = is the field allowed to be empty. **No** = required.

---

## Quick reference — all 43 tables

### Section 1 — Auth & access (5 tables)
| Table | What it stores |
|---|---|
| `SessionRevocation` | Marks a user's old sessions invalid after a password change (keyed by `email`). |
| `crm_auth_user` | The CRM's own user identity (linked to the HR `User` table in `ebright_hrfs` by email at sign-in). |
| `crm_auth_session` | Active CRM login sessions. |
| `crm_auth_account` | Credential/OAuth records per CRM user. |
| `crm_auth_verification` | Email-verification tokens. |

### Section 2 — Shared (1 table)
| Table | What it stores |
|---|---|
| `core_audit_log` | "Who did what, when" history across the whole system. |

### Section 3 — CRM core (28 tables)
| Table | What it stores |
|---|---|
| `crm_tenant` | The top-level organisation. |
| `crm_branch` | Each branch/location. |
| `crm_user_branch` | Which user has which role at which branch. *(No row here = "awaiting access".)* |
| `crm_pipeline` | A sales pipeline. |
| `crm_stage` | The stages inside a pipeline. |
| `crm_contact` | Leads / contacts (and their children's details). |
| `crm_opportunity` | A deal moving through the pipeline. |
| `crm_stage_history` | Record of every stage change. |
| `crm_lead_source` | Named lead sources. |
| `crm_tag` | Tags. |
| `crm_contact_tag` | Links contacts to tags. |
| `crm_note` | Notes on a contact. |
| `crm_task` | Follow-up tasks. |
| `crm_message` | Emails / WhatsApp / SMS messages. |
| `crm_call` | Logged phone calls. |
| `crm_message_template` | Reusable message templates. |
| `crm_custom_value` | Settings (key/value) per tenant or branch. |
| `crm_automation` | Automation definitions. |
| `crm_automation_run` | Each time an automation ran. |
| `crm_integration` | Connected integrations (Meta, Wix, …). |
| `crm_integration_oauth_token` | OAuth tokens for those integrations. |
| `crm_website_form` | Hosted lead-capture forms. |
| `crm_appointment` | Booked appointments. |
| `crm_notification` | In-app notifications. |
| `crm_email_settings` | Outbound email config per branch. |
| `crm_whatsapp_settings` | WhatsApp config per branch. |
| `crm_api_key` | API keys. |
| `crm_push_subscription` | Web-push (browser notification) subscriptions. |

### Section 4 — Ticketing (9 tables)
| Table | What it stores |
|---|---|
| `tkt_platform` | A ticketable platform/product. |
| `tkt_branch` | Branches in the ticket system. |
| `tkt_user_profile` | A user's ticketing profile + preferences. |
| `tkt_user_platform` | Which platforms a user can handle. |
| `tkt_user_branch` | Which branches a user can handle. |
| `tkt_ticket` | A support ticket. |
| `tkt_ticket_attachment` | Files on a ticket. |
| `tkt_ticket_event` | A ticket's activity timeline. |
| `tkt_counter` | Counters for generating ticket numbers. |

---

## What lives in another database

These tables are **not** in `ebright_crm` — the OSC system already has dedicated
databases for them. The app reads each via its own Prisma client / direct
connection (no FDW). Listed here so the builder doesn't accidentally try to
create them in `ebright_crm`.

### In `ebright_hrfs` (`HRFS_DATABASE_URL`, schema `public`)
| Table | What it stores | Why it lives there, not here |
|---|---|---|
| `User` | Login accounts (email + passwordHash, role). NextAuth credential-check authenticates against this table. | The CRM SSO bridge reads this via `HRFS_DATABASE_URL` and upserts a matching `crm_auth_user` row. Keeping it in HR keeps a single source of truth for staff identity. |
| `BranchStaff` | Staff directory (Staff Directory page reads this). | HR-owned. |
| `AttendanceLog` / `AttendanceLogST` | Clock in/out logs (HR scanners). | HR-owned; the CRM never reads them. |
| `LeaveTransaction` | Leave records. | HR-owned. |
| `MedicalLeave` | Medical-leave subset. | HR-owned. |
| `ManpowerSchedule` | Weekly staff rota. | HR-owned. |
| `Employee` | Coach/employee roster + pay rate. | HR-owned. |

### In `ebrightleads_db` (`LEADS_DB_URL` / `FA_DATABASE_URL`, schema `public`)
| Table | What it stores |
|---|---|
| `master_lead` | Unified raw lead landing-table (replaces the old `master_leads_base`). Direct webhook inserts from Meta / Wix / GHL land here. |
| `master_leads_unified` (VIEW) | Sibling-explode view of `master_lead` consumed by the CRM lead-ingest worker via LISTEN/NOTIFY on `lead_inserted`. |
| `meta_leads` / `raw_wix_leads` / `social_posts` | Legacy per-source raw tables. |
| `studentrecords` | Source for the Burnlist weekly snapshot feature. |
| `fa_*` / `pcm_*` | FA / PCM academy module tables (shared FA/PCM DB). |

> **Connections, not joins.** The CRM never does cross-database joins. Each
> client (`prisma`, `hrfsPrisma`, leads worker via `pg` driver) opens its own
> connection to its own database and runs queries against that DB only.
> Anything that *looks* like a join across databases is two separate queries
> stitched together in app code.

---

# Detailed columns

> Type key: `TEXT` = string, `INTEGER` = whole number, `BOOLEAN` = true/false,
> `TIMESTAMP(3)` = date+time, `TIMESTAMPTZ` = date+time with timezone,
> `DATE` = date only, `TIME(6)` = time only, `DECIMAL(a,b)` = number with
> decimals, `JSONB` = JSON data, `TEXT[]` = list of strings. A type in
> "quotes" is one of the enum types from Step 0.

## Section 1 — Auth & access

> The HR `User` table (login credentials) is **not in this database** — it
> lives in `ebright_hrfs.public."User"`. See
> [What lives in another database](#what-lives-in-another-database) for the
> column list of that table. The CRM app reads it via `HRFS_DATABASE_URL`.

### `SessionRevocation`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| email | TEXT | No | — |
| revokedAfter | TIMESTAMP(3) | No | — |

- **Primary key:** `email`

### `crm_auth_user`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| email | TEXT | No | — *(unique)* |
| emailVerified | BOOLEAN | No | `false` |
| name | TEXT | Yes | — |
| image | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `email`

### `crm_auth_session`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| userId | TEXT | No | — |
| token | TEXT | No | — *(unique)* |
| expiresAt | TIMESTAMP(3) | No | — |
| ipAddress | TEXT | Yes | — |
| userAgent | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `token`
- **Links to:** `userId` → `crm_auth_user(id)`, delete the sessions when the user is deleted (ON DELETE CASCADE)

### `crm_auth_account`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| userId | TEXT | No | — |
| accountId | TEXT | No | — |
| providerId | TEXT | No | — |
| accessToken | TEXT | Yes | — |
| refreshToken | TEXT | Yes | — |
| idToken | TEXT | Yes | — |
| accessTokenExpiresAt | TIMESTAMP(3) | Yes | — |
| refreshTokenExpiresAt | TIMESTAMP(3) | Yes | — |
| scope | TEXT | Yes | — |
| password | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`
- **Links to:** `userId` → `crm_auth_user(id)` (ON DELETE CASCADE)

### `crm_auth_verification`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| identifier | TEXT | No | — |
| value | TEXT | No | — |
| expiresAt | TIMESTAMP(3) | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`

## Section 2 — Shared

### `core_audit_log`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | Yes | — |
| userId | TEXT | Yes | — |
| userEmail | TEXT | Yes | — |
| action | TEXT | No | — |
| entity | TEXT | No | — |
| entityId | TEXT | Yes | — |
| meta | JSONB | Yes | — |
| ipAddress | TEXT | Yes | — |
| userAgent | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`
- **Indexes:** (`tenantId`, `entity`, `createdAt`), (`userId`, `createdAt`)

## Section 3 — CRM core

### `crm_tenant`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| name | TEXT | No | — |
| slug | TEXT | No | — *(unique)* |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `slug`

### `crm_branch`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| name | TEXT | No | — |
| code | TEXT | Yes | — *(short code, e.g. "AMP")* |
| region | TEXT | Yes | — *(A / B / C grouping)* |
| address | TEXT | Yes | — |
| phone | TEXT | Yes | — |
| email | TEXT | Yes | — |
| operatingHours | JSONB | Yes | — |
| timezone | TEXT | No | `'Asia/Kuala_Lumpur'` |
| branchManagerId | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`)
- **Links to:** `tenantId` → `crm_tenant(id)`

### `crm_user_branch`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| userId | TEXT | No | — |
| branchId | TEXT | No | — |
| tenantId | TEXT | No | — |
| role | "CrmUserRole" | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`userId`, `branchId`)  •  **Index:** (`tenantId`)
- **Links to:** `userId` → `crm_auth_user(id)` (ON DELETE CASCADE); `branchId` → `crm_branch(id)` (ON DELETE CASCADE)

### `crm_pipeline`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| name | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `branchId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_stage`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| pipelineId | TEXT | No | — |
| name | TEXT | No | — |
| shortCode | TEXT | No | — |
| order | INTEGER | No | — |
| color | TEXT | No | `'blue'` |
| stuckHoursYellow | INTEGER | No | `24` |
| stuckHoursRed | INTEGER | No | `48` |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `pipelineId`, `order`)
- **Links to:** `pipelineId` → `crm_pipeline(id)` (ON DELETE CASCADE)

### `crm_contact`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| firstName | TEXT | No | — |
| lastName | TEXT | Yes | — |
| email | TEXT | Yes | — |
| phone | TEXT | Yes | — |
| leadSourceId | TEXT | Yes | — |
| assignedUserId | TEXT | Yes | — |
| preferredBranchId | TEXT | Yes | — |
| preferredTrialDay | "TrialDay" | Yes | — |
| enrolledPackage | TEXT | Yes | — |
| parentFullName | TEXT | Yes | — *(parent's name when the row is a child)* |
| campaignName | TEXT | Yes | — *(marketing campaign, stored as-is)* |
| childName1 | TEXT | Yes | — |
| childAge1 | TEXT | Yes | — |
| childName2 | TEXT | Yes | — |
| childAge2 | TEXT | Yes | — |
| childName3 | TEXT | Yes | — |
| childAge3 | TEXT | Yes | — |
| childName4 | TEXT | Yes | — |
| childAge4 | TEXT | Yes | — |
| externalSourceTable | TEXT | Yes | — *(where the lead came from)* |
| externalSourceId | TEXT | Yes | — *(its id in that source)* |
| deletedAt | TIMESTAMP(3) | Yes | — *(soft delete)* |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`
- **Unique:** (`tenantId`, `externalSourceTable`, `externalSourceId`) — stops the same lead being imported twice
- **Indexes:** (`tenantId`, `branchId`), (`tenantId`, `email`), (`tenantId`, `phone`)
- **Links to:** `branchId` → `crm_branch(id)`; `leadSourceId` → `crm_lead_source(id)`; `assignedUserId` → `crm_auth_user(id)`

### `crm_opportunity`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| contactId | TEXT | No | — |
| pipelineId | TEXT | No | — |
| stageId | TEXT | No | — |
| value | DECIMAL(12,2) | No | `0` |
| assignedUserId | TEXT | Yes | — |
| lastStageChangeAt | TIMESTAMP(3) | No | now() |
| deletedAt | TIMESTAMP(3) | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Indexes:** (`tenantId`, `branchId`, `stageId`), (`tenantId`, `pipelineId`)
- **Links to:** `branchId` → `crm_branch(id)`; `contactId` → `crm_contact(id)`; `pipelineId` → `crm_pipeline(id)`; `stageId` → `crm_stage(id)`; `assignedUserId` → `crm_auth_user(id)`

### `crm_stage_history`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| opportunityId | TEXT | No | — |
| fromStageId | TEXT | Yes | — |
| toStageId | TEXT | No | — |
| changedByUserId | TEXT | Yes | — |
| note | TEXT | Yes | — |
| changedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `opportunityId`)
- **Links to:** `opportunityId` → `crm_opportunity(id)` (ON DELETE CASCADE); `fromStageId` → `crm_stage(id)`; `toStageId` → `crm_stage(id)`; `changedByUserId` → `crm_auth_user(id)`

### `crm_lead_source`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| name | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`)

### `crm_tag`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | Yes | — |
| name | TEXT | No | — |
| color | TEXT | No | `'#3b82f6'` |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_contact_tag`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| contactId | TEXT | No | — |
| tagId | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`contactId`, `tagId`)
- **Links to:** `contactId` → `crm_contact(id)` (ON DELETE CASCADE); `tagId` → `crm_tag(id)` (ON DELETE CASCADE)

### `crm_note`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| contactId | TEXT | No | — |
| userId | TEXT | Yes | — |
| body | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `contactId`)
- **Links to:** `contactId` → `crm_contact(id)` (ON DELETE CASCADE); `userId` → `crm_auth_user(id)`

### `crm_task`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| contactId | TEXT | Yes | — |
| assignedUserId | TEXT | Yes | — |
| title | TEXT | No | — |
| dueAt | TIMESTAMP(3) | Yes | — |
| completedAt | TIMESTAMP(3) | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Indexes:** (`tenantId`, `branchId`), (`tenantId`, `assignedUserId`, `dueAt`)
- **Links to:** `branchId` → `crm_branch(id)`; `contactId` → `crm_contact(id)`; `assignedUserId` → `crm_auth_user(id)`

### `crm_message`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| contactId | TEXT | No | — |
| userId | TEXT | Yes | — |
| channel | "MessageChannel" | No | — |
| direction | "MessageDirection" | No | — |
| body | TEXT | No | — |
| subject | TEXT | Yes | — |
| status | TEXT | No | `'pending'` |
| providerMessageId | TEXT | Yes | — |
| errorMessage | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `branchId`, `contactId`)
- **Links to:** `branchId` → `crm_branch(id)`; `contactId` → `crm_contact(id)`; `userId` → `crm_auth_user(id)`

### `crm_call`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| contactId | TEXT | No | — |
| userId | TEXT | Yes | — |
| outcome | TEXT | Yes | — |
| notes | TEXT | Yes | — |
| duration | INTEGER | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `contactId`)
- **Links to:** `contactId` → `crm_contact(id)` (ON DELETE CASCADE); `userId` → `crm_auth_user(id)`

### `crm_message_template`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | Yes | — |
| name | TEXT | No | — |
| channel | "MessageChannel" | No | — |
| subject | TEXT | Yes | — |
| body | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_custom_value`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| key | TEXT | No | — |
| value | TEXT | No | — |
| scope | "CustomValueScope" | No | `'TENANT'` |
| scopeId | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`tenantId`, `scope`, `scopeId`, `key`)  •  **Index:** (`tenantId`)
- **Links to:** `scopeId` → `crm_branch(id)`

### `crm_automation`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | Yes | — |
| name | TEXT | No | — |
| triggerType | "AutomationTriggerType" | No | — |
| triggerConfig | JSONB | No | `'{}'` |
| graph | JSONB | No | `'{}'` |
| enabled | BOOLEAN | No | `false` |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_automation_run`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| automationId | TEXT | No | — |
| contactId | TEXT | Yes | — |
| triggeredByUserId | TEXT | Yes | — |
| status | "AutomationRunStatus" | No | `'PENDING'` |
| startedAt | TIMESTAMP(3) | No | now() |
| completedAt | TIMESTAMP(3) | Yes | — |
| logs | JSONB | No | `'[]'` |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `automationId`)
- **Links to:** `automationId` → `crm_automation(id)` (ON DELETE CASCADE); `contactId` → `crm_contact(id)`; `triggeredByUserId` → `crm_auth_user(id)`

### `crm_integration`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| type | "IntegrationType" | No | — |
| credentials | TEXT | Yes | — |
| status | "IntegrationStatus" | No | `'DISCONNECTED'` |
| lastSyncAt | TIMESTAMP(3) | Yes | — |
| meta | JSONB | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`branchId`, `type`)  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_integration_oauth_token`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| integrationId | TEXT | No | — |
| accessToken | TEXT | No | — |
| refreshToken | TEXT | Yes | — |
| expiresAt | TIMESTAMP(3) | Yes | — |
| scope | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`
- **Links to:** `integrationId` → `crm_integration(id)` (ON DELETE CASCADE)

### `crm_website_form`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| name | TEXT | No | — |
| schema | JSONB | No | `'[]'` |
| publicSlug | TEXT | No | — *(unique)* |
| submissionsCount | INTEGER | No | `0` |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `publicSlug`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_appointment`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — |
| contactId | TEXT | No | — |
| userId | TEXT | Yes | — |
| startAt | TIMESTAMP(3) | No | — |
| endAt | TIMESTAMP(3) | No | — |
| title | TEXT | Yes | — |
| notes | TEXT | Yes | — |
| calendarProvider | TEXT | Yes | — |
| externalId | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `branchId`)
- **Links to:** `branchId` → `crm_branch(id)`; `contactId` → `crm_contact(id)`; `userId` → `crm_auth_user(id)`

### `crm_notification`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| userId | TEXT | No | — |
| type | TEXT | No | — |
| title | TEXT | No | — |
| body | TEXT | No | — |
| link | TEXT | Yes | — |
| readAt | TIMESTAMP(3) | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`tenantId`, `userId`, `readAt`)
- **Links to:** `userId` → `crm_auth_user(id)` (ON DELETE CASCADE)

### `crm_email_settings`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — *(unique — one per branch)* |
| fromEmail | TEXT | No | — |
| fromName | TEXT | No | — |
| resendDomainVerified | BOOLEAN | No | `false` |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `branchId`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_whatsapp_settings`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| branchId | TEXT | No | — *(unique — one per branch)* |
| provider | "WhatsAppProvider" | No | — |
| credentials | TEXT | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `branchId`  •  **Index:** (`tenantId`)
- **Links to:** `branchId` → `crm_branch(id)`

### `crm_api_key`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenantId | TEXT | No | — |
| name | TEXT | No | — |
| hashedKey | TEXT | No | — *(unique)* |
| scopes | TEXT[] | No | `'{}'` (empty list) |
| lastUsedAt | TIMESTAMP(3) | Yes | — |
| createdByUserId | TEXT | Yes | — |
| revokedAt | TIMESTAMP(3) | Yes | — |
| createdAt | TIMESTAMP(3) | No | now() |
| updatedAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** `hashedKey`  •  **Index:** (`tenantId`)
- **Links to:** `createdByUserId` → `crm_auth_user(id)`

### `crm_push_subscription`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| userId | TEXT | No | — |
| tenantId | TEXT | No | — |
| endpoint | TEXT | No | — |
| p256dh | TEXT | No | — |
| auth | TEXT | No | — |
| createdAt | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`userId`, `endpoint`)  •  **Index:** (`tenantId`, `userId`)

## Section 4 — Ticketing

### `tkt_platform`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenant_id | TEXT | No | — |
| name | TEXT | No | — |
| slug | TEXT | No | — |
| code | TEXT | No | — |
| accent_color | TEXT | No | `'#6b7280'` |
| created_at | TIMESTAMP(3) | No | now() |
| updated_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`tenant_id`, `slug`), (`tenant_id`, `name`)  •  **Index:** (`tenant_id`)

### `tkt_branch`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenant_id | TEXT | No | — |
| name | TEXT | No | — |
| code | TEXT | No | — |
| branch_number | TEXT | No | — *("01".."26")* |
| created_at | TIMESTAMP(3) | No | now() |
| updated_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`tenant_id`, `branch_number`), (`tenant_id`, `code`)  •  **Index:** (`tenant_id`)

### `tkt_user_profile`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| user_id | TEXT | No | — *(this IS the primary key; it equals a `crm_auth_user.id`)* |
| tenant_id | TEXT | No | — |
| role | TEXT | No | — *("super_admin" / "platform_admin" / "user")* |
| email_notifications | BOOLEAN | No | `true` |
| dark_theme | BOOLEAN | No | `true` |
| activity_updates | BOOLEAN | No | `true` |
| system_alerts | BOOLEAN | No | `false` |
| audit_logs | BOOLEAN | No | `false` |
| created_at | TIMESTAMP(3) | No | now() |
| updated_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `user_id`  •  **Indexes:** (`tenant_id`), (`tenant_id`, `role`)

### `tkt_user_platform`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| user_id | TEXT | No | — |
| platform_id | TEXT | No | — |

- **Primary key:** (`user_id`, `platform_id`) together
- **Links to:** `user_id` → `tkt_user_profile(user_id)` (ON DELETE CASCADE); `platform_id` → `tkt_platform(id)` (ON DELETE CASCADE)

### `tkt_user_branch`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| user_id | TEXT | No | — |
| branch_id | TEXT | No | — |

- **Primary key:** (`user_id`, `branch_id`) together
- **Links to:** `user_id` → `tkt_user_profile(user_id)` (ON DELETE CASCADE); `branch_id` → `tkt_branch(id)` (ON DELETE CASCADE)

### `tkt_ticket`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| ticket_number | TEXT | No | — |
| tenant_id | TEXT | No | — |
| branch_id | TEXT | No | — |
| platform_id | TEXT | No | — |
| user_id | TEXT | No | — *(who submitted it)* |
| issue_context | TEXT | No | — |
| sub_type | TEXT | No | — |
| fields | JSONB | No | — |
| status | TEXT | No | `'received'` |
| admin_remark | TEXT | Yes | — |
| rejection_reason | TEXT | Yes | — |
| assigned_admin_id | TEXT | Yes | — |
| completed_at | TIMESTAMP(3) | Yes | — |
| visible_until | TIMESTAMP(3) | Yes | — |
| created_at | TIMESTAMP(3) | No | now() |
| updated_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`tenant_id`, `ticket_number`)
- **Indexes:** (`tenant_id`, `platform_id`, `status`), (`tenant_id`, `branch_id`), (`tenant_id`, `user_id`)
- **Links to:** `platform_id` → `tkt_platform(id)`; `branch_id` → `tkt_branch(id)`; `user_id` → `tkt_user_profile(user_id)`

### `tkt_ticket_attachment`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| ticket_id | TEXT | No | — |
| url | TEXT | No | — |
| filename | TEXT | No | — |
| size | INTEGER | No | — |
| mime_type | TEXT | No | — |
| created_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`ticket_id`)
- **Links to:** `ticket_id` → `tkt_ticket(id)` (ON DELETE CASCADE)

### `tkt_ticket_event`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| ticket_id | TEXT | No | — |
| event_type | TEXT | No | — |
| description | TEXT | Yes | — |
| meta | JSONB | Yes | — |
| created_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Index:** (`ticket_id`)
- **Links to:** `ticket_id` → `tkt_ticket(id)` (ON DELETE CASCADE)

### `tkt_counter`
| Column | Type | Null? | Default |
|--------|------|-------|---------|
| id | TEXT | No | (app) |
| tenant_id | TEXT | No | — |
| platform_id | TEXT | No | — |
| branch_id | TEXT | Yes | — |
| counter_type | TEXT | No | — |
| year | INTEGER | No | — |
| month | INTEGER | Yes | — |
| day | INTEGER | Yes | — |
| current_count | INTEGER | No | `0` |
| created_at | TIMESTAMP(3) | No | now() |
| updated_at | TIMESTAMP(3) | No | now() |

- **Primary key:** `id`  •  **Unique:** (`tenant_id`, `platform_id`, `branch_id`, `counter_type`, `year`, `month`, `day`)  •  **Index:** (`tenant_id`)
- **Links to:** `platform_id` → `tkt_platform(id)`; `branch_id` → `tkt_branch(id)`

---

## Order to create tables (so the links don't fail)

Create tables that nothing points to first, then the rest:

1. **First:** `SessionRevocation`, `crm_auth_user`, `crm_auth_verification`,
   `core_audit_log`, `crm_tenant`, `crm_lead_source`, `tkt_platform`,
   `tkt_branch`, `tkt_user_profile`.
2. **Then:** `crm_auth_session`, `crm_auth_account`, `crm_branch`,
   `crm_user_branch`, `crm_pipeline`, `crm_stage`, `crm_tag`, `crm_contact`,
   `crm_opportunity`, `crm_stage_history`, `crm_contact_tag`, `crm_note`,
   `crm_task`, `crm_message`, `crm_call`, `crm_message_template`,
   `crm_custom_value`, `crm_automation`, `crm_automation_run`, `crm_integration`,
   `crm_integration_oauth_token`, `crm_website_form`, `crm_appointment`,
   `crm_notification`, `crm_email_settings`, `crm_whatsapp_settings`,
   `crm_api_key`, `crm_push_subscription`, `tkt_user_platform`,
   `tkt_user_branch`, `tkt_ticket`, `tkt_ticket_attachment`, `tkt_ticket_event`,
   `tkt_counter`.

**Easiest option:** the application uses Prisma. If you point Prisma at the empty
`ebright_crm` database and run its setup, it creates all of these in the right
order for you. (This is safe here because there are no foreign tables/views to
clobber.)

---

## Confirmed decisions

1. **Multi-database architecture — aligned with the OSC convention.** `ebright_crm`
   contains only CRM + ticketing + audit + auth. HR tables (`User`, `BranchStaff`,
   `AttendanceLog`, `AttendanceLogST`, `LeaveTransaction`, `MedicalLeave`,
   `ManpowerSchedule`, `Employee`) live in **`ebright_hrfs`** and are reached via
   `HRFS_DATABASE_URL`. Lead-source tables (`master_lead`, `master_leads_unified`,
   `meta_leads`, `raw_wix_leads`, `social_posts`, `studentrecords`) live in
   **`ebrightleads_db`** and are reached via `LEADS_DB_URL` / `FA_DATABASE_URL`.
   **No FDW**, no cross-database joins — each domain has its own direct
   connection.
2. **Burnlist — OUT OF SCOPE.** The `burnlist_week` and `burnlist_entry` tables
   are **not** created in this DB. (Total is therefore **43 tables**.)
3. **Production + Staging — identical names, separate instances.** Both
   environments use the **same database name `ebright_crm`** and the **same table
   names**, built from this one sheet. They must live on **two separate
   PostgreSQL instances** (different host/port, or at minimum different clusters)
   so that work on one never affects the other — they must **not** be the same
   physical database (that shared setup is what caused the original outage). The
   app simply points at a different connection string per environment.

## Reference — full connection-string layout

For both production and staging, the four URLs the app expects (taken from the
canonical OSC `.env`):

```
DATABASE_URL=postgresql://<user>:<pw>@<host>:<port>/ebright_crm?schema=crm
LEADS_DB_URL=postgres://<user>:<pw>@<host>:<port>/ebrightleads_db
HRFS_DATABASE_URL=postgresql://<user>:<pw>@<host>:<port>/ebright_hrfs?schema=public
FA_DATABASE_URL=postgres://<user>:<pw>@<host>:<port>/ebrightleads_db
```

The CRM Prisma client uses `DATABASE_URL` (`?schema=crm`). HRFS access uses
a separate Prisma client pointed at `HRFS_DATABASE_URL`. The lead-ingest
worker opens a raw `pg` connection to `LEADS_DB_URL` for LISTEN/NOTIFY +
polling. The FA module reads `FA_DATABASE_URL` (same DB as leads, separate
URL so the FA team can repoint it independently if needed).
