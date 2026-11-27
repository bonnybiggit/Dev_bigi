# Dev_Bigi School Management System

## Windows Desktop Preview

### Version 0.2: Standalone, Main Server and LAN Client

New installations show a mode picker before starting services. Existing desktop installations retain Standalone mode, their data directory, database selection, accounts, signing secret and backups. Open **Connection settings** in the desktop menu to change mode. Switching to Client preserves existing local records and starts neither MongoDB nor a backend. Clients need no separately installed Node.js, MongoDB, npm, Atlas credentials or personal online account. Browser clients need only a supported browser.

| Mode | Services on this PC | Access |
| --- | --- | --- |
| Standalone | Authenticated loopback MongoDB and backend | Local Electron window |
| Main Server | Same services plus an HTTPS listener | Local window and LAN users |
| LAN Client | Neither MongoDB nor backend | Configured HTTPS server only |

1. **Main Server:** install MongoDB and its Windows runtime as described below. Choose Main Server and enter an address assigned to this PC, for example `https://192.168.1.10:5443`. Private IPv4 addresses and local computer names (optionally `.local`) are supported. HTTP, internet addresses, embedded credentials and URL paths are refused. Keep the address stable, for example through a router DHCP reservation. Register the school, owner and administrator on the server's local desktop window; remote bootstrap/registration is blocked.
2. Reopen **Connection settings** to see the server URL, SHA-256 certificate fingerprint and public certificate path, typically `%LOCALAPPDATA%\SchoolManagementDesktopPreview\tls\192_168_1_10.cer`. Share only this `.cer` and fingerprint through a trusted channel. Never share `.pfx`, `replica.key`, `installation.json` or database files. The generated HTTPS identity lasts two years and persists across restarts; a changed address/renewed identity requires client trust updates.
3. **Desktop client:** install the same `setup.exe`, choose LAN Client and enter the HTTPS address and fingerprint (colons optional). The exact fingerprint, certificate name and validity are checked before loading the server. No certificate-warning bypass is enabled.
4. **Windows browser client:** securely copy the public `.cer`, compare its file SHA-256 with the server's displayed fingerprint, then import it into Current User → Trusted Root Certification Authorities. Open `https://192.168.1.10:5443/school-login` and sign in with the school's local account:

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath .\192_168_1_10.cer
   # Import only after the fingerprint matches the server operator's value:
   Import-Certificate -FilePath .\192_168_1_10.cer -CertStoreLocation Cert:\CurrentUser\Root
   ```

5. If Windows Firewall blocks the trusted LAN, an administrator can add the following rule on the server, replacing the example IP/port. The application does not silently change the firewall. Use the Private network profile only on a trusted network; guest Wi-Fi/client isolation can prevent device-to-device access.

   ```powershell
   New-NetFirewallRule -DisplayName 'School Desktop HTTPS LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress 192.168.1.10 -LocalPort 5443 -RemoteAddress LocalSubnet -Profile Private
   ```

   **Never allow or forward MongoDB port 27028.** Do not enable router port forwarding or internet exposure.
6. Keep the Main Server app open and PC awake. Closing it stops its application listeners and identified MongoDB process. Backups, recovery activation and installation administration remain available only on the server desktop. Existing administrator/teacher/student roles, tenant scoping and session revocation apply equally over LAN. Owner login is available remotely, but cannot administer machine backups there.

The HTTPS listener binds only to the selected LAN interface. LAN cookies are HttpOnly, Secure and SameSite=Strict. Host/Origin checks, authentication, rate limits and school scoping apply without trusting tenant IDs or proxy headers. The app needs no internet/CDN. Initial desktop connection failures retry every five seconds. Loaded browser/desktop pages probe health, show loss/recovery messages and offer **Reload workspace** after recovery; review unsaved edits before reloading. Failed writes are never queued or automatically replayed. LAN use still requires server power and a functioning local network.

Keep ample free server disk space for records, MongoDB journals, recovery databases and backup history. The tested MongoDB 8.2.6 refuses certain writes below **500 MiB free**; this can interrupt a restore without activating its target. Free space and retry rather than deleting business databases or weakening MongoDB's safety threshold. Run large verification drills serially on constrained machines. TLS certificate trust/renewal is manual; Windows x64/private IPv4 LANs are supported, and the installer remains unsigned.

Both server modes now enforce **SCRAM authentication and replica-set keyfile authentication** on MongoDB, bound only to **127.0.0.1:27028**. Random supervisor/application credentials are protected with Windows user encryption. The application has database read/write, database-administration and monitoring roles, without MongoDB user-administration privileges. Private PFX/keyfile permissions allow only the Windows user, SYSTEM and Administrators; private keys never reach clients. The database connection URI contains no password.

Upgrades migrate only the exact older desktop MongoDB configuration. An identified legacy process is stopped, its configuration saved as `mongodb/mongod.cfg.pre-auth`, authentication enabled and initial users created through MongoDB's localhost exception. School collections, account hashes, backups and recovery selection are retained. Unknown configurations, unrelated occupied ports, unexpected existing MongoDB users or missing security files fail closed. Keep the protected settings/keyfile; do not downgrade to the unauthenticated 0.1 launcher. Transfer schools to another account/PC using encrypted application backups, since Windows-protected secrets are not portable.

Validation commands: `npm run desktop:test` tests security/migration; `npm run desktop:verify` tests the installed Standalone backup/recovery/persistence flow; `npm run desktop:verify:lan -- --keep-server` tests an installed Main Server, two independent HTTPS sessions and a separate Client profile, then waits for a real second-device check. Press Enter in that terminal to stop the synthetic server and uninstall the test copy. Do not run desktop drills simultaneously: they share port 27028. Builds use fresh `.local/desktop-package-*` directories so an open older `release/win-unpacked` copy is not overwritten. Tests use separate synthetic data.

Build on Windows x64 with `npm ci` then `npm run desktop:dist`. The Electron / Electron Builder / NSIS output is **release/setup.exe**, with **release/setup.exe.sha256**. Build-time dependencies may require internet; the installed application bundles its frontend, backend, Node runtime and production dependencies and operates offline. Environment files, Atlas credentials, developer accounts, databases and backups are excluded from the package. No commit, push or deployment is part of this workflow.

On Standalone/Main Server PCs only, install MongoDB Community Server **7 or newer** and its required Microsoft Visual C++ runtime beforehand (use offline prerequisite installers for an offline computer). MongoDB itself is an external prerequisite, not bundled or downloaded automatically. Launch **School Desktop Preview** after installation. After choosing Standalone or Main Server, the launcher locates `mongod.exe` under Program Files or PATH, or lets you choose it. It automatically writes the private local configuration, starts a single-member `schoolDesktopRs` replica set on **127.0.0.1:27028**, waits for PRIMARY, initializes indexes and starts the bundled API/frontend on an available loopback port. It does not modify existing MongoDB services, firewall rules or Atlas databases. Closing the app waits for backup operations and shuts down its identified local database. Startup here means application launch; no Windows sign-in task/service is installed.

The first run is empty. Register your school, an installation owner (Super Admin for full backups/recovery) and a separate school administrator with your own local sign-in identifiers and passwords. No personal online account, email delivery, seeded school or default password is required. These identifiers are local accounts. Use the School Administrator portal for daily work and the Super Admin portal for **Backup & Recovery**. For an existing archive on a new computer, choose **Recover an existing school from backup**, create a temporary owner, inspect and restore the archive, then activate the verified recovery database in the desktop interface. Restored users keep their original passwords.

Persistent files live under **%LOCALAPPDATA%\\SchoolManagementDesktopPreview\\**, separately from installed program files: `mongodb/data`, `mongodb/mongod.log`, `backups`, `installation.json`, browser state and logs. The signing secret is protected for the current Windows user. NSIS rejects overlapping installation/data locations before extraction and retains data on upgrades and uninstall. Do not manually delete this folder. Keep encrypted backup copies on another device and keep their recovery passphrases separately. Copying MongoDB files while running is not a backup; use Backup & Recovery. Do not copy the Windows-protected settings to another account/computer; restore an encrypted archive there instead.

The renderer is sandboxed with Node integration disabled and context isolation enabled. External requests/navigation and permissions are blocked. The HTTP service binds to loopback and checks Host, Origin and a fresh private launch token; ordinary browsers cannot use it. MongoDB also binds only to loopback. MongoDB now requires authentication. Main Server exposes a separate HTTPS application listener for LAN users; the local HTTP listener remains private. This preview assumes a trusted server Windows account/computer; operating-system administrators can access local machine secrets. External logo URLs are unavailable offline; upload a local logo in School Profile.

The installer is unsigned, so Windows may display SmartScreen warnings. It targets Windows x64 only; MongoDB/Windows compatibility and prerequisite runtime installation must be checked on each target machine. Daily backups run while the application is open. Upgrades must retain the same app ID and persistent directory; future incompatible schema migrations need separate validation. The frontend currently has a Vite bundle-size advisory.

`npm run desktop:verify` performs an opt-in real silent installation and reinstall using synthetic accounts and isolated `.local/desktop-drill-*` program/data folders. It checks the installed Electron application through a loopback debugging session, registration, both logins, network restrictions, encrypted backup/restore, recovery activation, restart and persistence. It retains evidence and synthetic data there; it never targets existing school data. It registers preview shortcuts/uninstall information for the current user. Debugging is enabled only by the explicit verification flag. See the verification results recorded below for checks actually completed in this environment.

Historical desktop 0.1 validation (27 November 2026): all **218 backend tests passed**, zero failures/skips; ESLint and the desktop frontend production build passed. The packaged ASAR was inspected: bundled frontend/backend present, no private environment/data/archive paths and no Atlas SRV connection strings in application files. Windows x64 NSIS compilation passed and the installer checksum is beside the artifact. The default Electron icon and unsigned executable are preview limitations; physical printing, SmartScreen behavior on other computers and future-version schema upgrades require target-machine validation.

The final installed-app drill passed **all 10 checks** on Windows with MongoDB 8.2.6: real NSIS silent install, rendered first-run form and independent registration, owner/admin login, blocked external renderer traffic and unauthenticated localhost access, encrypted backup and verified restore, same-version reinstall, retained accounts/school/backup files and history, activation of the recovered database with restored login after restart, and database/settings/backup retention after uninstall. The hidden-parent-directory frontend-serving bug discovered by this drill was fixed; the final focused desktop regression passed **8/8**, and lint passed again. Evidence: [.local/desktop-drill-1795779540655/result.json](.local/desktop-drill-1795779540655/result.json); distributable summary: [release/verification.json](release/verification.json). Verification used synthetic data and renderer-issued API calls, with a DOM check of the setup form; interactive installer clicks, manual completion of every form and a clean machine without prerequisites remain manual checks. Test application/MongoDB processes were stopped, test uninstall information/shortcuts removed, and synthetic persistent data retained. Existing business databases were left untouched.

Milestones 1–6: project foundation, Super Admin workspace, School Administrator accounts, school profile, academic structure, teachers/staff, students/admissions, parents/guardians, attendance, and school fees/finance. React/Vite (JavaScript), Tailwind CSS, Lucide React, Axios, Express, MongoDB/Mongoose, bcrypt, and JWT cookies.

Milestone 7 adds examinations, assigned-teacher score entry, result approval/publication and printable report cards. Existing modules and their data remain available.

## Run locally

Requires Node.js 20.19+ or 22.12+ and MongoDB Atlas or a MongoDB replica set. Milestone 3 uses transactions; a standalone local `mongod` is not sufficient for configuration writes. Your existing Atlas connection and DNS configuration work unchanged.

For an independent Windows installation with persistent local storage and no Atlas connection, use **Independent Windows local replica set** below. Its scripts use separate environment files and ports; the existing commands in this section retain their original environment behaviour.

From the project root:

```powershell
npm install
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Edit `backend/.env` before continuing. Generate a secret using `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Set your own initial Super Admin email and password; the password must have at least 12 characters and at most 72 UTF-8 bytes. There are no default credentials.

```powershell
npm run seed
npm run dev
```

Open http://localhost:5173 and sign in with the seeded credentials. The API runs on http://localhost:5000. Vite proxies `/api` to Express, keeping development cookie requests same-origin. You can run the services separately with `npm run dev -w backend` and `npm run dev -w frontend`.

The seed is idempotent: it preserves an existing Super Admin's password and refuses to promote a school account. It does not create schools or invent statistics. In Schools → Register school, choose **Use Bright Future sample details**, review **Bright Future International School, Lagos, Nigeria — Nursery and Primary**, and submit to persist it. Repeated registrations are rejected. School details support confirmed suspension/reactivation.

## Test School Administrator management

1. Run `npm run dev` using your existing backend environment and Atlas database. No reseeding, new environment variables, or data reset is required for Milestone 2.
2. Sign in at `/login` as Super Admin. In **Schools**, open Bright Future International School with **View** and scroll to **Administrator management**.
3. Choose **Add administrator**, enter full name, email, and phone, and submit. The backend generates a random temporary password and stores only its bcrypt hash. Save and share the displayed credentials securely before dismissing them or closing the dialog; there is no password retrieval endpoint or browser persistence.
4. Sign out, then open `/school-login` (also linked from the login page). Sign in with the new email and temporary password. You must replace it with a different password of at least 12 characters and at most 72 UTF-8 bytes before entering `/school`.
5. The school overview displays database counts of that school's administrator accounts: total, active, inactive, and awaiting password setup. Other schools and platform accounts are excluded. School profile, academic sessions, terms, classes and subjects are available in Milestone 3; teachers/staff, students/admissions and parents/guardians are available in Milestone 4 Parts 1–3. Attendance is available in Milestone 5 and Fees & Finance in Milestone 6. Statistics come from the database.
6. Sign out and return as Super Admin to activate or deactivate the account in the same school's details. Deactivation blocks login and existing sessions. Reactivation requires a fresh login. School suspension blocks school login and authenticated requests too.

If a temporary password is lost before it is changed, there is no reset/recovery flow in this phase. Account recovery remains a future task. Never store the temporary password in logs or local storage.

Milestone 2 changed files:

| Area                              | Files                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend model and authorization   | `backend/src/models/User.js`, `backend/src/middleware/auth.js`                                                                                                                                |
| Backend routes and error handling | `backend/src/app.js`, `backend/src/routes/auth.js`, `backend/src/routes/schools.js`, new `backend/src/routes/administrators.js`, new `backend/src/routes/schoolWorkspace.js`                  |
| Integration tests                 | New `backend/test/administrators.test.js`                                                                                                                                                     |
| Frontend routing and session      | `frontend/src/App.jsx`, `frontend/src/context/AuthContext.jsx`, new `frontend/src/lib/navigation.js`                                                                                          |
| Frontend shared components        | `frontend/src/components/Layout.jsx`, `frontend/src/components/SchoolDetails.jsx`, new `frontend/src/components/AdministratorManagement.jsx`                                                  |
| Frontend pages and styling        | `frontend/src/pages/Login.jsx`, new `frontend/src/pages/ChangePassword.jsx`, new `frontend/src/pages/SchoolDashboard.jsx`, new `frontend/src/pages/ComingSoon.jsx`, `frontend/src/styles.css` |
| Documentation                     | `README.md`                                                                                                                                                                                   |

Milestone 2 validation: all 28 backend tests passed, ESLint passed, and the frontend production build passed. Browser visual verification was unavailable in the development environment. Tests use isolated MongoDB and do not create administrator accounts in your Atlas database.

## Milestone 3: school configuration and academic structure

No new environment variables, reseeding, data reset, or sample records are required. Start with `npm run dev` and sign in through `/school-login` with Bright Future International School's administrator account. Existing schools gain optional contact and logo fields with empty defaults; the API waits for the new academic indexes before listening.

1. **School Profile** (`/school/profile`): review or edit the school name, address, city, country, phone, email, type and logo. Upload a local PNG/JPEG logo (up to 256 KiB and 1024 × 1024 pixels) for use without internet, or retain an existing HTTPS image URL without embedded credentials. Platform status and ownership fields cannot be changed. `/school/settings` redirects here. See the school branding section below for storage, permissions and sign-in links.
2. **Academic Sessions** (`/school/sessions`): create `2026/2027`, with dates such as `2026-09-01` to `2027-07-31`, then activate it using the confirmation dialog. Create `2027/2028` for the following year as needed. Session names are unique per school; dates cannot overlap, including sharing an end/start day. New sessions start inactive. Replacing the active session requires explicit confirmation; declining leaves the current session untouched. `/school/academics` redirects here.
3. **Terms** (`/school/terms`): choose a session and create First Term, Second Term and Third Term. For the sample above, try `2026-09-01`–`2026-12-18`, `2027-01-05`–`2027-04-01`, and `2027-04-20`–`2027-07-30`. A term cannot duplicate another name or overlap dates within that session, leave the parent's dates, or move between sessions. Session edits cannot exclude existing terms. Each session can have one active term, independently of whether that session is active; replacing it requires confirmation.
4. **Classes** (`/school/classes`): use Nursery 1–3 or Primary 1–6 suggestions, or another appropriate class name. Enter optional comma-separated arms such as `A, B, C` and total capacity across the whole class. Arms are normalized to uppercase and cannot duplicate each other. Class names are unique per school, including inactive classes.
5. **Subjects** (`/school/subjects`): select an active class and add a name, optional code and description. The same subject can be configured separately for multiple classes, but cannot be duplicated within the same class. Edit records or confirm activation/deactivation from the table.

All dates are validated calendar days stored at UTC midnight, with end date strictly after start date. Overlap checks apply to inactive records too. Sessions and terms start inactive; classes and subjects start active. Class and subject deletion is disabled regardless of linked records, protecting future student data; use deactivation instead. Deactivating a class retains its subjects and other linked records, but blocks new subject assignments and subject activation until the class is active again. No status change cascades silently into dependent records.

Every new academic record carries `schoolId`. The protected school router derives it from the authenticated administrator, rejects client-supplied tenant/ownership fields, and scopes lists, edits, status changes and parent lookups to that school. Cross-school record IDs return 404. Configuration mutations use a per-school write inside MongoDB transactions to serialize validation and updates, including simultaneous overlapping dates; unique indexes also enforce names and active-session/term constraints.

| Method      | School API endpoint                                   | Purpose                                                                             |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET / PUT   | `/api/school/profile`                                 | Read/update editable school profile fields                                          |
| GET / POST  | `/api/school/sessions`                                | List/create sessions                                                                |
| PUT         | `/api/school/sessions/:id`                            | Edit name and dates                                                                 |
| PATCH       | `/api/school/sessions/:id/status`                     | Set active/inactive; `confirmSwitch: true` is required to replace an active session |
| GET / POST  | `/api/school/terms`                                   | List/create terms with `sessionId`                                                  |
| PUT         | `/api/school/terms/:id`                               | Edit a term within its original session                                             |
| PATCH       | `/api/school/terms/:id/status`                        | Set active/inactive; confirmation is required to replace an active term             |
| GET / POST  | `/api/school/classes`                                 | List/create names, arms, capacity                                                   |
| PUT / PATCH | `/api/school/classes/:id` / `…/:id/status`            | Edit / activate or deactivate                                                       |
| GET / POST  | `/api/school/subjects`                                | List/create subjects with `classId`                                                 |
| PUT / PATCH | `/api/school/subjects/:id` / `…/:id/status`           | Edit / activate or deactivate                                                       |
| DELETE      | `/api/school/classes/:id`, `/api/school/subjects/:id` | Own records return 405; use deactivation                                            |

Creation/edit bodies contain only form fields (not `schoolId`, status, or platform settings). Status bodies contain `status: "active"` or `"inactive"`; session/term activation additionally accepts boolean `confirmSwitch`. Profile edits use the full editable profile returned by GET. Dates use `YYYY-MM-DD`; class arms use an array of strings and capacity uses a positive integer up to 10,000.

Milestone 3 changed files:

| Area                               | Files                                                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Models                             | Updated `backend/src/models/School.js`; new `AcademicSession.js`, `AcademicTerm.js`, `SchoolClass.js`, `Subject.js` in the same directory                                                                                            |
| Routes, service and validation     | New `backend/src/routes/schoolConfiguration.js`, `backend/src/services/schoolConfiguration.js`, `backend/src/validation/academic.js`; updated `backend/src/routes/schoolWorkspace.js`, `backend/src/app.js`, `backend/src/server.js` |
| Backend tests                      | New `backend/test/academic.test.js` with an isolated replica set                                                                                                                                                                     |
| Frontend pages and shared controls | New `frontend/src/pages/SchoolProfile.jsx`, `AcademicStructure.jsx`; new `frontend/src/components/ConfigurationFields.jsx`, `ConfigurationTable.jsx`, `ConfirmationDialog.jsx`; new `frontend/src/lib/academicConfiguration.js`      |
| Navigation and visual integration  | Updated `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `SchoolTable.jsx`, `frontend/src/pages/SchoolDashboard.jsx`, `frontend/src/styles.css`                                                                         |
| Documentation                      | `README.md`                                                                                                                                                                                                                          |

Milestone 3 verification: all 40 backend tests, ESLint, and the frontend production build passed. Coverage includes profile ownership/updates, session creation/editing/activation/confirmation, dates and duplicates, term creation/editing/activation, parent date integrity, class arms and capacity, subject association, deactivation and retained student fixtures, cross-school access, concurrent overlapping writes, role permissions and previous authentication behavior. No Atlas sample records are created by tests. Browser visual verification remains a manual check in this environment.

## Environment variables

Backend environment files are read relative to `backend` by its workspace scripts.

| Variable               | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`             | `development`, `test`, or `production`; production enables Secure cookies    |
| `PORT`                 | API port; default 5000                                                       |
| `MONGODB_URI`          | Private MongoDB connection string                                            |
| `JWT_SECRET`           | Private random signing secret, at least 32 characters                        |
| `FRONTEND_ORIGIN`      | Exact browser origin, e.g. `http://localhost:5173`; no trailing slash        |
| `SUPER_ADMIN_NAME`     | Name used by the seed                                                        |
| `SUPER_ADMIN_EMAIL`    | Email used by the seed                                                       |
| `SUPER_ADMIN_PASSWORD` | Initial seed password; remove from deployment environment after provisioning |
| `VITE_API_URL`         | Optional public API base path; defaults to `/api`; never put secrets here    |

## Structure

```text
backend/src/
  app.js                 Express middleware and routing
  server.js              Validated configuration, DB startup, shutdown
  config.js, db.js        Environment and database boundaries
  models/                User and School schemas
  middleware/            Authentication and role authorization
  routes/                Auth and Super Admin school API
  services/              Idempotent Super Admin provisioning
  scripts/               Seed entry point
backend/test/             Database-backed API integration tests
frontend/src/
  components/            Layout, brand, table, dialogs and school forms
  context/               Cookie session state
  lib/                   Axios API boundary
  pages/                 Login, dashboard, school directory
  styles.css             Tailwind entry and responsive design system
```

## API

All mutation requests require `Origin` to exactly match `FRONTEND_ORIGIN`, including API-client requests. This combines with SameSite=Strict cookies to protect against cross-site request forgery. The client must send credentials. Login returns public user information, never a token or password hash.

| Method | Endpoint                                                  | Access                                                                     |
| ------ | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/health`                                             | Public; 200 when DB connected, 503 otherwise                               |
| POST   | `/api/auth/login`                                         | Super Admin credentials; rate limited                                      |
| GET    | `/api/auth/me`                                            | Authenticated active account                                               |
| POST   | `/api/auth/school-login`                                  | School Administrator credentials; rate limited                             |
| POST   | `/api/auth/change-password`                               | School Administrator; currentPassword, newPassword                         |
| POST   | `/api/auth/logout`                                        | Clears browser session cookie                                              |
| GET    | `/api/schools/stats`                                      | Super Admin; real DB counts                                                |
| GET    | `/api/schools?search=Lagos&page=1&limit=10`               | Super Admin; paginated, literal search                                     |
| POST   | `/api/schools`                                            | Super Admin; name, city, country, schoolType                               |
| GET    | `/api/schools/:id`                                        | Super Admin                                                                |
| PATCH  | `/api/schools/:id/status`                                 | Super Admin; `{ "status": "active" }` or `suspended`                       |
| GET    | `/api/schools/:id/administrators`                         | Super Admin; administrator details for this school                         |
| POST   | `/api/schools/:id/administrators`                         | Super Admin; name, email, phone; returns temporary password once           |
| PATCH  | `/api/schools/:id/administrators/:administratorId/status` | Super Admin; boolean isActive; account must belong to school               |
| GET    | `/api/school/dashboard`                                   | School Administrator after password change; own school and DB counts       |
| GET    | `/api/school/administrators/:id`                          | School Administrator after password change; same-school administrator only |

School types: Nursery, Primary, Nursery and Primary, Secondary, Other. Status cannot be supplied through registration. Errors use a consistent `message` with validation details where applicable. Duplicate school names in the same city and country are rejected case-insensitively.

## Tenant and offline architecture

`School` is the tenant root. Every school-owned record must carry a required `schoolId`; `User` enforces it for `school_admin`. Platform Super Admin accounts have no tenant and cannot carry a `schoolId`. The current Super Admin school operations intentionally span tenants. School workspace routes derive `schoolId` from the verified account and scope every record lookup and count to it. Cross-school administrator lookups return 404. Administrator creation and status changes are exclusively Super Admin operations; creation uses an existing school from the URL and rejects client-supplied roles, passwords, schoolId and status. Emails are globally unique and normalized to lowercase, including across schools and roles. Existing stored role values (`super_admin`, `school_admin`) are preserved.

Authentication reloads account role, active state, school membership, and session version from MongoDB on every protected request, and denies school accounts whose school is suspended or missing. Frontend guards redirect by role and first-login state; backend checks enforce permissions. Accounts requiring a first password change may only use session inspection, password change, and logout; they cannot access workspace data. JWTs expire after eight hours. Password changes and administrator activation/deactivation increment the session version, revoking prior cookies. Logout clears the browser cookie; a copied current cookie remains valid until expiry or a version change. Existing Super Admin accounts need no migration; new optional User fields have defaults. The school/role index is additive.

Axios is isolated in `frontend/src/lib/api.js`, reusable UI components consume API responses, and models have timestamps. These boundaries prepare for future repositories, local storage, conflict handling and synchronization. No offline cache, service worker, outbox, or synchronization is implemented; administration requires connectivity and errors are displayed explicitly.

## Verification and production

```powershell
npm test
npm run lint
npm run build
npm run preview -w frontend
```

Tests use an isolated real MongoDB process via `mongodb-memory-server`; the first run downloads a MongoDB binary and needs network access. Tests do not access your configured application database. They cover health, bcrypt hashing and idempotent seed, login, cookie properties, validation, registration, case-insensitive duplicate prevention, literal search, real statistics, details, status transitions, tenant/role denial, suspended schools, disabled accounts and logout.

Milestone 2 tests additionally cover generated temporary-password hashing and non-disclosure on retrieval, duplicate emails across tenants, account validation and role injection, first-login restrictions, current/new password validation, old temporary-password and session rejection after a change, school-scoped statistics, cross-school record access, activation/deactivation and session revocation, missing/suspended schools, and continued Super Admin access. DNS and seed diagnostic tests remain in the suite.

`npm run build` creates `frontend/dist`; the backend runs directly with `npm start -w backend`. Deploy the frontend and reverse-proxy `/api` to Express under the same HTTPS origin. Configure `FRONTEND_ORIGIN` to that exact HTTPS origin, `NODE_ENV=production`, private MongoDB access and a unique secret. Serve SPA routes with an `index.html` fallback. Do not serve `.env` or source credentials. The development proxy is not part of a production build. Separate-site frontend/API deployments are not supported by the Strict cookie policy.

Before broader commercial deployment, plan monitoring, an external rate-limit store when running multiple API processes and password recovery/MFA. Local encrypted backups, recovery and their audit history are now implemented in the Backup & Recovery section below. Other operational requirements remain separate. No deployment is performed by this project setup.

## Milestone 4 Part 1: teachers and staff

Run `npm run dev`, sign in through `/school-login` as Bright Future's administrator, and open **Teachers & Staff** (`/school/staff`). The previous `/school/teachers` URL redirects here. There are no new dependencies, environment variables, seed requirements, or demo records. Existing Atlas or replica-set MongoDB is required for staff writes, just as for academic configuration. Startup creates the staff indexes before accepting requests.

- Add a teaching or non-teaching staff profile with employee ID, full name, email, phone, gender, address, optional date of birth, employment date, department, designation and employment type. Dates must be real calendar dates; date of birth must be in the past and precede employment date. New profiles start active.
- Employee IDs are trimmed and normalized to uppercase; they are unique within the school, including inactive records. The same ID can exist in a different school. Staff email is a contact field, not a unique login identity.
- Teaching staff may have multiple assigned classes and subjects. Assignments are optional, use the school's existing academic records, and cannot include duplicate IDs. Each subject must belong to a selected class. New assignments require active classes and subjects. Previously assigned inactive records can be retained while editing the profile, or removed; inactive classes cannot receive new subject assignments. Non-teaching staff cannot carry teaching assignments, and changing category to non-teaching clears them in the form.
- Search by name, employee ID, email, phone, department or designation. Search text is treated literally, including regex characters. Filter by category, status and employment type; results are paginated with 10 rows per page. School-wide cards show real total staff, teaching staff, non-teaching staff, active staff and the inactive count, independently of the current directory filters. Errors never substitute invented counts.
- View a complete profile, edit it, and confirm deactivation/reactivation from the directory. Editing a profile does not reactivate it. No permanent deletion is available, even for unreferenced records. Profiles, academic assignments and future module references remain intact after deactivation.

Staff profiles are separate from User accounts: creation, editing and status changes do not create accounts, issue passwords, or grant login access. Only authenticated active school administrators who completed password setup can use the staff API. Super Admin accounts cannot use these school routes. The school ID is always derived from the authenticated User; request-supplied schoolId, role, createdBy or status cannot be injected into create/edit bodies. Lists, counts, details, edits, status changes and assignment lookups are tenant-scoped. Unknown and cross-school record IDs return the same 404. Assignment validation and writes share the academic configuration transaction lock to avoid races with academic edits.

| Method | Endpoint                       | Purpose                                                                                           |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| GET    | `/api/school/staff`            | Paginated directory; accepts search, category, status, employmentType, department, page and limit |
| GET    | `/api/school/staff/stats`      | Real school-wide staff counts                                                                     |
| POST   | `/api/school/staff`            | Create active staff profile                                                                       |
| GET    | `/api/school/staff/:id`        | Complete own-school profile                                                                       |
| PUT    | `/api/school/staff/:id`        | Update profile fields and teaching assignments; preserves status                                  |
| PATCH  | `/api/school/staff/:id/status` | `{ "status": "active" }` or `{ "status": "inactive" }`                                            |
| DELETE | `/api/school/staff/:id`        | Own records return 405; deactivate instead                                                        |

Create/edit fields: `employeeId`, `fullName`, `email`, `phone`, `gender`, `address`, `dateOfBirth`, `employmentDate`, `department`, `designation`, `employmentType`, `category`, `classIds`, `subjectIds`. Gender values: `female`, `male`, `other`, `not_specified`. Categories: `teaching`, `non_teaching`. Employment types: `full_time`, `part_time`, `contract`, `temporary`, `intern`. Assignment arrays default to empty, birth date accepts an empty value/null, and dates use `YYYY-MM-DD`. This is a full PUT update of editable fields, not a partial PATCH. Directory page defaults to 1; limit defaults to 10 and is capped at 50. Optional API department filtering uses a case-insensitive exact match. Unknown query/body fields are rejected.

Changed files for Part 1:

| Area                  | Files                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Staff backend         | New `backend/src/models/Staff.js`, `backend/src/validation/staff.js`, `backend/src/services/staff.js`, `backend/src/routes/staff.js`                                     |
| Integration           | Updated `backend/src/routes/schoolWorkspace.js`, `backend/src/server.js`; `backend/src/validation/academic.js` now exports its existing calendar-day validator for reuse |
| Tests                 | New `backend/test/staff.test.js` with isolated replica-set MongoDB                                                                                                       |
| Staff frontend        | New `frontend/src/pages/StaffManagement.jsx`, `frontend/src/components/StaffForm.jsx`, `frontend/src/components/StaffDetails.jsx`, `frontend/src/lib/staff.js`           |
| Dashboard integration | Updated `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/pages/SchoolDashboard.jsx`, `frontend/src/styles.css`                                |
| Documentation         | `README.md`                                                                                                                                                              |

Part 1 verification: all 53 backend tests passed, ESLint passed, and the frontend production build passed. The integration tests cover both categories, every profile field, duplicate IDs within/across schools, concurrent duplicates, assignment ownership/class matching/active-state checks, retained inactive assignments, detail/edit operations, literal search, filters, pagination, real scoped statistics, safe deactivation and retained references, role restrictions, password-change restrictions, and suspended schools. The full suite also retains all previous milestone tests. Tests do not write to your Atlas database. Browser visual verification remains manual in this environment. Student admissions were added in Part 2 below; parent/guardian management remains unimplemented.

## Milestone 4 Part 2: students and admissions

Run `npm run dev`, sign in as Bright Future International School's School Administrator, and open **Students & Admissions** (`/school/students`). Existing Atlas/replica-set configuration is sufficient; no new packages, environment variables, seed data, or data reset are required. Startup waits for the new Student indexes. Super Admin and staff functionality are preserved.

1. In **Academic Sessions**, activate the session for new admissions. In **Classes**, ensure the chosen class is active and its arms are available. Classes remain school-wide, not tied to a specific session; every student placement explicitly records both session and class.
2. Choose **Register student**. Supply admission number, first/last name, optional middle name, birth date, gender, contact address, admission date, optional previous school, session, class, arm and admission status. Choose a valid active arm when the class has arms; leave it blank for classes without arms. Birth date must be in the past and before admission date. Dates use `YYYY-MM-DD` and are stored at UTC midnight.
3. Admission numbers are trimmed and normalized to uppercase, and are unique within the school, including inactive and archived students. The same number can exist in another school. New records start `active`; admission status is separately recorded as `pending`, `admitted`, `waitlisted` or `rejected`. Active describes the record's operational status and does not imply admitted.
4. The directory supports name/admission-number search (including full names), filters for session, class, arm, student status and admission status, and pagination. Status filters include archived records, which remain searchable. Directory responses intentionally omit birth dates, addresses, gender, previous school and audit fields; **View profile** opens `/school/students/:id` for the authorised detail view.
5. Edit student information from the profile. Placement/admission-state changes prompt for confirmation. New placements require an active same-school session, class and arm. Existing inactive placements may be retained unchanged during a personal-information edit; changing placement or activating the student requires current active references. Invalid or foreign academic IDs are rejected.
6. Deactivate or archive students using confirmation dialogs on the directory/profile. Archiving retains the full record, placement, admission number and other references and makes the profile read-only. **Restore** makes an archived record inactive first; review/edit its placement before activating it. Editing an inactive profile never implicitly activates it. Permanent deletion is disabled for all student records, so existing/future academic references remain intact.

Class arms continue using the existing name arrays. An optional `inactiveArms` array now records which named arms are closed to new placements. Legacy classes default to no inactive arms, and older API clients omitting `inactiveArms` retain existing values when editing. The class form exposes **Inactive arms**, which must be a unique subset of the class's arms. Deactivation retains students already assigned there; removing an arm referenced by any student (including archived students) is blocked. Mark that arm inactive instead. Assignment checks and class updates share the same per-school transaction lock, preventing placement races.

The student page shows real school-wide counts of total students, active students, archived students and non-archived pending admissions; the active card also reports inactive students. Counts are independent of directory filters. Request failures show an error rather than fabricated numbers. Student records do not create User accounts or login credentials.

Security: the existing authenticated `school_admin` router, first-password-change restrictions, active-account checks and active-school checks protect every student endpoint. Each query is scoped to the authenticated User's school. Request-supplied schoolId, status and audit fields are rejected in create/edit bodies. Unknown and foreign record IDs return the same 404; academic references and filter references must belong to the school. Responses use explicit field allowlists, and existing API `Cache-Control: no-store` applies. Student details are not logged. No parent/guardian fields or Part 3 modules are introduced.

| Method | Endpoint                          | Purpose                                                                                                      |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/school/students`            | Minimal paginated directory; search, sessionId, classId, arm, status, admissionStatus, page, limit           |
| GET    | `/api/school/students/stats`      | School-wide database counts                                                                                  |
| POST   | `/api/school/students`            | Create active student and academic placement                                                                 |
| GET    | `/api/school/students/:id`        | Authorised profile details                                                                                   |
| PUT    | `/api/school/students/:id`        | Full update of editable fields; preserves operational status                                                 |
| PATCH  | `/api/school/students/:id/status` | `{ "status": "active" }`, `inactive` or `archived`; archived-to-active is blocked until restored to inactive |
| DELETE | `/api/school/students/:id`        | Own records return 405; deactivate/archive instead                                                           |

Create/edit fields: `admissionNumber`, `firstName`, `middleName`, `lastName`, `dateOfBirth`, `gender`, `address`, `admissionDate`, `previousSchool`, `sessionId`, `classId`, `arm`, `admissionStatus`. Middle name, previous school and arm default to empty (arm must be populated if the selected class has arms). Gender values: `female`, `male`, `other`, `not_specified`. List limits default to 10 and are capped at 50. Arm filtering requires a class filter and a matching arm. Unsupported fields and query parameters are rejected.

Optional photos: the existing school logo feature supports external HTTPS URLs, but the project has no private, authorised upload/storage pipeline for student images. Student photos and photo URLs are therefore not accepted in this phase; external tracking/image hosting is not introduced for children’s profiles. Add private media storage in a separately authorised phase before enabling student photos.

Changed files for Part 2:

| Area                                           | Files                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student backend                                | New `backend/src/models/Student.js`, `backend/src/validation/student.js`, `backend/src/services/student.js`, `backend/src/routes/students.js`                                                                                                                                                                                                             |
| Backend integration and arm safety             | Updated `backend/src/models/SchoolClass.js`, `backend/src/validation/academic.js`, `backend/src/routes/schoolConfiguration.js`, `backend/src/routes/schoolWorkspace.js`, `backend/src/server.js`                                                                                                                                                          |
| Integration tests                              | New `backend/test/students.test.js`                                                                                                                                                                                                                                                                                                                       |
| Student frontend                               | New `frontend/src/lib/students.js`, `frontend/src/hooks/useStudentOptions.js`, `frontend/src/components/StudentForm.jsx`, `StudentStatusActions.jsx`, `Pagination.jsx`, `frontend/src/pages/StudentManagement.jsx`, `StudentProfile.jsx`                                                                                                                  |
| Shared controls, academic forms and navigation | Updated `frontend/src/components/ConfigurationFields.jsx` (required textarea support), `Modal.jsx` (unique accessible dialog titles), `SchoolTable.jsx` (archived badge), `Layout.jsx`, `frontend/src/lib/academicConfiguration.js`, `frontend/src/pages/AcademicStructure.jsx`, `SchoolDashboard.jsx`, `frontend/src/App.jsx`, `frontend/src/styles.css` |
| Documentation                                  | `README.md`                                                                                                                                                                                                                                                                                                                                               |

Verification: all **65 backend tests passed**, ESLint passed, and the frontend production build passed. Tests include creation/editing, concurrent/tenant-specific duplicate admission numbers, input/date validation, active/inactive/foreign placement references, arm combinations, scoped search/filtering/pagination, privacy of directory responses, real statistics, archiving/restoration/deactivation, retained academic references, inactive-arm lifecycle, roles, first-password-change and school suspension. All 53 previous tests remain green. Tests use isolated replica-set MongoDB and leave Atlas data untouched. Browser visual verification remains manual. Student photos are the optional deferred capability; parent/guardian management and Part 3 are not implemented.

## Milestone 4 Part 3: parents and guardians

Run `npm run dev`, sign in as Bright Future International School's School Administrator, and open **Parents & Guardians** at `/school/guardians`. Existing Atlas/replica-set configuration is sufficient: there are no new packages, environment variables, seed requirements or live demo records. Startup waits for the new Guardian and StudentGuardian indexes before accepting requests.

1. **Register guardian** collects full name, optional email, primary phone, optional alternative phone, residential address, optional occupation, optional gender and optional emergency-contact name/phone/relationship. A supplied emergency contact requires both name and phone. Profiles start active. Emails are normalized to lowercase. Contact phone/email values are not login identities and are not required to be unique; search before creating a duplicate contact profile.
2. **View profile** opens `/school/guardians/:id` with full authorised contact details, profile editing, confirmed activation/deactivation and **Linked children**. Contact-list responses include only ID, name, email, primary phone and status. Residential/emergency details and internal school/audit fields are not exposed in directories or relationship summaries.
3. Use **Link student** on a guardian profile, or **Link guardian** under the new **Parents & guardians** section of `/school/students/:id`. The picker searches the existing paginated school directories rather than downloading every profile. Choose Father, Mother, Guardian or Other as the relationship to that student. One guardian can have multiple linked children; a student can have multiple guardians. An existing pair cannot be duplicated under another relationship label: edit the existing link instead.
4. **Edit** changes only the relationship label. To change either endpoint, remove the old link and add the correct one. **Remove link** requires confirmation and marks the relationship inactive with a removal timestamp; it never deletes either profile or the relationship document. Re-linking the same pair restores the original document, retaining its ID and original creation metadata. No complete versioned audit log is implemented.
5. Inactive guardian profiles retain all current student links and remain visible as inactive on student profiles, but cannot receive new links until activated. Existing relationship labels may still be corrected. New/edited relationships are blocked for archived students; safe link removal is permitted. Restore the student through the existing admission workflow before linking or editing. Student inactivity alone does not prevent recording guardian contacts.
6. Search the guardian directory by name, email, primary or alternative phone. Filter by active/inactive status and with/without student links. Pagination defaults to 10 records and is capped at 50. Search treats regex characters literally. Counts are school-wide and independent of directory filters: total profiles, active profiles, inactive profiles and unique linked students; the linked-student card also reports the current relationship count. These counts include retained current links to inactive guardians and archived students; removed links are excluded.
7. **Deactivate** preserves the entire contact profile and every student relationship. Editing the profile does not reactivate it. Permanent profile deletion is disabled even if it is currently unlinked, preserving both existing and removed relationship references. Guardian status changes never alter student status or login account access.

Every new record has a schoolId derived from the authenticated School Administrator. All guardian queries, statistics, pair lookups and opposite-endpoint lookups explicitly use that school. Relationship creation/editing/removal checks both the guardian and student; missing/foreign IDs return 404. Compound uniqueness on `(schoolId, guardianId, studentId)` and the shared per-school MongoDB transaction lock protect against concurrent duplicate links. Request-supplied tenant, role, status, login-password or audit fields are rejected. Existing role, active-account, password-change and suspended-school middleware protects all endpoints. Contact profiles never create User accounts or parent login credentials; no portal, fees, payments, attendance, results or messaging is added.

| Method    | Endpoint                                        | Purpose                                                                                        |
| --------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET       | `/api/school/guardians`                         | Minimal directory with search, status, linkage (`linked`/`unlinked`), page, limit              |
| GET       | `/api/school/guardians/stats`                   | Real school-scoped profile/link statistics                                                     |
| POST      | `/api/school/guardians`                         | Create active contact profile                                                                  |
| GET / PUT | `/api/school/guardians/:id`                     | Read full contact profile / update editable fields, preserving status                          |
| PATCH     | `/api/school/guardians/:id/status`              | `{ "status": "active" }` or `{ "status": "inactive" }`                                         |
| DELETE    | `/api/school/guardians/:id`                     | Own records return 405; deactivate instead                                                     |
| GET       | `/api/school/guardians/:id/students`            | All current linked children with minimal student summaries                                     |
| GET       | `/api/school/students/:id/guardians`            | All current linked guardians with minimal contact summaries                                    |
| POST      | `/api/school/guardians/:id/students/:studentId` | Create/restore a relationship; `{ "relationship": "father" }`, `mother`, `guardian` or `other` |
| PUT       | `/api/school/guardians/:id/students/:studentId` | Edit relationship label; endpoints cannot be reassigned                                        |
| DELETE    | `/api/school/guardians/:id/students/:studentId` | Soft-remove link; returns 204; no nonempty body accepted                                       |

Profile create/edit fields: `fullName`, `email`, `primaryPhone`, `alternativePhone`, `address`, `occupation`, `gender`, `emergencyContactName`, `emergencyContactPhone`, `emergencyContactRelationship`. Only name, primary phone and address are mandatory. Gender defaults to `not_specified`, with `female`, `male` and `other` supported. Optional contact fields default to empty strings. PUT uses the full editable profile; it cannot alter status or student relationships. New link creation is separate from profile registration so existing student records and permissions are reused.

Changed files for Part 3:

| Area                                    | Files                                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Models                                  | New `backend/src/models/Guardian.js`, `backend/src/models/StudentGuardian.js`                                                                                                                                         |
| Validation, service and routes          | New `backend/src/validation/guardian.js`, `backend/src/services/guardian.js`, `backend/src/routes/guardians.js`                                                                                                       |
| Backend integration                     | Updated `backend/src/routes/students.js` (guardian summaries), `backend/src/routes/schoolWorkspace.js`, `backend/src/server.js` (index readiness)                                                                     |
| Integration tests                       | New `backend/test/guardians.test.js`                                                                                                                                                                                  |
| Frontend pages and definitions          | New `frontend/src/pages/GuardianManagement.jsx`, `GuardianProfile.jsx`, `frontend/src/lib/guardians.js`                                                                                                               |
| Reusable guardian controls              | New `frontend/src/components/GuardianForm.jsx`, `GuardianStatusAction.jsx`, `GuardianRelationships.jsx`, `EntityPicker.jsx`                                                                                           |
| Navigation, student integration, styles | Updated `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `Pagination.jsx` (non-submit buttons for form reuse), `frontend/src/pages/StudentProfile.jsx`, `SchoolDashboard.jsx`, `frontend/src/styles.css` |
| Documentation                           | `README.md`                                                                                                                                                                                                           |

Verification: all **77 backend tests passed**, ESLint passed, and the frontend production build passed. All 65 previous tests remain green. New integration coverage includes profile creation/editing and optional fields, phone/email/emergency validation, many-to-many links, duplicate and concurrent-link rejection, editing/removal/relinking, cross-school endpoints/references, literal search, filters, pagination, minimal personal-data responses, real school statistics, activation/deactivation, archive restrictions, retained records, role/password-change/active-account/suspended-school checks, and no User creation. All tests run against isolated MongoDB replica sets and do not alter Atlas data. Browser visual verification remains manual in this environment.

## Milestone 5: attendance management

Run `npm run dev` and sign in as School Administrator. Open **Student Attendance**, **Staff Attendance**, or **Attendance Reports** from the navy sidebar. Existing Atlas/replica-set configuration is sufficient; no dependencies, environment variables, data reset or new seed credentials are required. Startup waits for the new Attendance and AttendanceAudit indexes. Existing `/school/attendance` links redirect to Student Attendance.

### Mark and correct attendance

1. **Student Attendance** (`/school/attendance/student`): choose session, date, class and arm, optionally search by name/admission number, and **Load register**. A class with arms requires one of its arms; a class without arms uses an empty arm. Registered students must be active and admitted to the selected placement on/before the date. Here "admitted" refers to admission date: the operationally active records are included regardless of their separate application admissionStatus. New marking requires an active session, class and arm, and the attendance date must be within the session's dates.
2. **Staff Attendance** (`/school/attendance/staff`): choose date, optional teaching/non-teaching category and name/employee-ID search. Active staff employed on/before the date appear. Both categories use the same daily statuses.
3. Select **Present**, **Absent**, **Late** or **Excused** individually. **Apply to editable people on this page** applies the chosen status to the visible page only (25 people), with no silent cross-page changes. Review the unsaved-change count and confirm **Save changes**. Unmarked people are never automatically converted to absent. Loading another register/page with unsaved changes prompts before discarding them.
4. The register shows saved counts for the entire selected roster before name search: expected, present, absent, late, excused and unmarked. The Student Attendance page also shows the same day's school-wide staff summary. Counts update after saving/reloading; they do not pretend unsaved drafts are database records.
5. Change a saved status to correct it. Supply a correction reason (3 - 300 characters) and confirm. Each real change appends a separate audit record with previous/new status, revision, administrator ID/name, timestamp and reason. The original creator and creation time remain unchanged. Saving an unchanged status at the current revision is a no-op and creates no extra audit event.
6. **View audit** displays a paginated history of the initial mark and every correction, including actor and time. Revision checks reject stale browsers, repeat creates and competing corrections with 409; reload before attempting another correction. Bulk writes are atomic: any invalid/ineligible/cross-school entry aborts the complete batch and its audit writes.

Each `(schoolId, kind, personId, date)` has at most one attendance record, enforced by a unique index. Student uniqueness is across classes/arms/sessions on that date; moving the student cannot create a second daily mark. Each person's first saved mark snapshots their name/identifier and academic placement or staff category, so later profile edits do not rewrite reports. All writes share the school configuration transaction lock to prevent races with student/staff/academic edits.

Attendance days use **Africa/Lagos (WAT)**, stored as UTC-midnight calendar dates. Future dates are rejected in roster requests, writes and report anchors/ranges. No holiday calendar, timetable, school-day schedule or automatic absence generation is introduced. Dates before the person's admission/employment cannot receive new marks.

### Historical records and eligibility

Inactive/archived students and inactive staff cannot receive new attendance or corrections. Their existing records remain reportable and visible as read-only in their original registers. Previously saved student records may be corrected by an authorised administrator if the student is still active, even after a placement transfer or academic session/class/arm deactivation; the original saved placement is immutable. Such corrections must use the original register and current revision. New attendance still requires a current eligible placement and active academic context. Removing a class arm referenced by attendance is blocked; deactivate it instead. Attendance/audit records have no permanent-delete or audit-edit endpoint.

Expected daily roster counts use the current eligible roster for that date plus retained recorded people in that register, so a later transfer/deactivation cannot hide an existing mark. They are **not frozen historical enrolment snapshots** for unmarked people. Historical percentages and summaries use recorded observations, rather than inventing expected school days for prior weeks/months. Attendance snapshots do not constitute a complete student transfer/enrolment-history module.

### Reports, histories and percentages

Open `/school/attendance/reports`:

- Choose students or staff and a daily, weekly, monthly or custom range. Weeks run Monday - Sunday. Month/week ends are clipped to today if the selected period is ongoing; custom ranges must be ordered, end no later than today and span at most 367 inclusive days.
- Filter by academic session/class/arm for students or teaching/non-teaching category for staff, plus status and name/identifier search. A class filter is required for an arm filter. Inactive academic references remain available for historical reports. All reference IDs are checked against the school.
- **Choose individual** uses the existing paginated directory to select a student or staff member, including inactive/archived people, and opens their filtered attendance history. **Clear individual** returns to a group report. Staff category and person-name snapshots reflect the saved attendance record, not subsequent profile edits.
- Summary cards, a daily breakdown and paginated records use real matching database records. Summary calculations cover the complete filtered result, independently of the current record page. Days without records are omitted rather than fabricated as zero/absent days. Audit history is available from each saved record.

Percentage = **100 - (Present + Late) / (Present + Late + Absent)**, rounded to two decimal places. Excused observations and unmarked people/days are excluded from the denominator; Late counts as attendance. A zero denominator displays ** - **, not a fabricated 0% or 100%. Status/search/person/placement filters apply to both records and calculated summaries, so a filtered report describes those observations only.

Security: only existing authorised `school_admin` accounts with active school/account access and completed password setup can mark, correct or report attendance. Super Admin and unauthenticated access to these school routes is denied. Every query, aggregate, reference check, audit lookup and mutation is scoped to the verified user's schoolId. No supplied schoolId/actor/audit metadata is accepted. Rosters and reports expose names and identifiers plus necessary attendance/audit data, not birth dates, residential addresses, guardian contacts or password data. Guardians gain no attendance portal, and User/authentication architecture is unchanged.

| Method | Endpoint                                         | Purpose                                                                                      |
| ------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| GET    | `/api/school/attendance/student/roster`          | date, sessionId, classId, arm, optional search/page/limit; real roster and saved summary     |
| GET    | `/api/school/attendance/staff/roster`            | date, optional category/search/page/limit                                                    |
| PUT    | `/api/school/attendance/student`                 | Mark/correct a student batch in one date/placement                                           |
| PUT    | `/api/school/attendance/staff`                   | Mark/correct a daily staff batch                                                             |
| GET    | `/api/school/attendance/reports`                 | kind, period, date or from/to; optional placement/category/personId/status/search/page/limit |
| GET    | `/api/school/attendance/:kind/history/:personId` | Same report period/filter parameters; kind/person come only from path                        |
| GET    | `/api/school/attendance/records/:id/audit`       | School-scoped paginated append-only audit history                                            |
| DELETE | `/api/school/attendance/records/:id`             | Own records return 405; use an audited correction                                            |

`kind` is `student` or `staff`; status values are lowercase `present`, `absent`, `late`, `excused`. All mutation requests retain the existing Origin/cookie protections. Unknown input/query fields are rejected. Attendance paging defaults to 25 and is capped at 50. A bulk write accepts 1 - 100 unique people (the UI saves one visible page):

```json
{
  "date": "2026-11-20",
  "sessionId": "<school-session-id>",
  "classId": "<school-class-id>",
  "arm": "A",
  "entries": [
    { "personId": "<student-id>", "status": "present", "revision": 0 }
  ],
  "correctionReason": ""
}
```

For staff omit sessionId, classId and arm. New records use revision 0; saved records return revision 1 initially, incrementing on each status correction. Corrections must send the saved current revision and a nonempty reason. Do not retry a 409 blindly; reload the roster and review the latest mark.

Changed files for Milestone 5:

| Area                       | Files                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Models                     | New `backend/src/models/Attendance.js`, `backend/src/models/AttendanceAudit.js`                                                                                                                                                                                                    |
| Backend logic              | New `backend/src/validation/attendance.js`, `backend/src/services/attendance.js`, `backend/src/routes/attendance.js`                                                                                                                                                               |
| Backend integration        | Updated `backend/src/routes/schoolWorkspace.js`, `backend/src/server.js`, `backend/src/routes/schoolConfiguration.js` (retain attendance-referenced arms)                                                                                                                          |
| Tests                      | New `backend/test/attendance.test.js`                                                                                                                                                                                                                                              |
| Attendance pages           | New `frontend/src/pages/AttendanceMarking.jsx`, `frontend/src/pages/AttendanceReports.jsx`                                                                                                                                                                                         |
| Shared attendance UI       | New `frontend/src/components/AttendanceSummary.jsx`, `AttendanceAudit.jsx`, `AttendancePlacementFields.jsx`, `frontend/src/lib/attendance.js`                                                                                                                                      |
| Navigation and integration | Updated `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/pages/SchoolDashboard.jsx`, `frontend/src/styles.css`, `frontend/src/components/EntityPicker.jsx` (staff and archived-student history selection, preserving existing guardian-picker defaults) |
| Documentation              | `README.md`                                                                                                                                                                                                                                                                        |

Verification: all **89 backend tests passed**, ESLint passed, and the final frontend production build passed. All 77 previous tests remain green. Backend coverage includes student/staff creation and corrections, all statuses, duplicate/index/concurrent-write prevention, incomplete registers, daily/weekly/monthly/custom calculations, class/arm/category filters, individual histories, literal search/pagination, revision conflicts, audit actors/times/reasons, atomic rollback, inactive/archived/future-date/reference rejection, historical snapshots/corrections, tenant isolation and roles. Existing authentication, academic, staff, student and guardian suites remain included. Tests use isolated replica-set MongoDB and do not create or change live Atlas records. Browser visual verification remains manual in this environment. Fees, payments, examinations, results, timetables and parent portals remain outside this milestone.

## Milestone 6: fees and financial management

Run `npm run dev`, sign in as School Administrator, and open **Fees & Finance**. The existing Atlas/replica-set configuration is sufficient; there are no new dependencies, environment variables, credentials, seed records or data resets. The API waits for all new financial indexes before accepting requests. No online payment gateway, parent login or payment portal is introduced.

### Configure fees and generate invoices

1. Open **Fee structures** (`/school/finance/structures`). Add real fee categories such as Tuition or Books for your school. Built-in payment methods are Cash, Bank transfer, POS and Other. Add/edit/deactivate additional school-owned methods as needed. Built-ins are fixed options, not demo transactions or fictitious figures. Names are case-insensitively unique within the school and option type.
2. **Create structure**: choose an existing session, its term, and a class. Select fee categories, enter decimal NGN amounts, and mark each fee compulsory or optional. Structure configuration may use inactive/future academic periods for planning. Duplicate categories and inconsistent term/session combinations are rejected. Only one current structure exists per school/session/term/class.
3. Edit the current structure when charges change. An unused structure may be edited in place with an incremented revision. Once an invoice references a structure, editing creates a new current version and retains the previous used version and fee lines. Historical versions are viewable and cannot be edited. The period/class of a structure is immutable; configure a separate structure for another period/class.
4. Open **Student invoices** (`/school/finance/invoices`) and **Generate invoice**. Select an active student, choose a current structure matching their assigned session and class, and select any optional fees. Compulsory fees are always included. There must be at least one billable line. Invoice generation snapshots category names, amounts, fee types, structure version, student name/admission number, class and fee period.
5. A student has at most one invoice per school/session/term, regardless of class transfers or optional-fee selections. Repeated generation is rejected. Issued lines and period fields cannot be overwritten, even on unpaid invoices. Later corrections use reasoned financial entries instead of rewriting the original bill. Existing accounts remain payable/reportable after student inactivity or archival; new invoice generation requires an active student.

Category deactivation prevents selection in new structure edits; it does not silently remove an approved charge from a structure or rewrite existing invoices. Change the current structure explicitly when retiring a charge. Payment-method deactivation blocks new payments using that custom method but preserves prior payments/receipts and their saved method names.

### Collect payments and print receipts

Open **View account** on an invoice (`/school/finance/invoices/:id`) to see gross billed fees, net paid, discounts/scholarships, signed adjustments, outstanding balance, original fee lines, payment history, financial entries and audit events.

- **Record payment** accepts the full balance or a partial amount, payment date, method, and optional bank/POS/external reference. Multiple partial payments record instalments against the same invoice. No instalment calendar or automated collection is assumed. Future payment dates are rejected using the existing WAT/Africa-Lagos calendar-day rule.
- Review and confirm before posting. An overpayment or credit exceeding the invoice balance is blocked. Payment references are generated cryptographically on the backend and unique per school. A supplied external reference is normalized to uppercase and cannot be reused, including after reversal.
- Every payment form has a stable retry key. Retrying the identical payload with the same key returns the original payment, including its current reversed status if applicable, without changing the balance again. Reusing a key for different payment details returns 409. Do not open a fresh form to retry an uncertain network result before reviewing the payment history.
- After posting, the printable receipt opens at `/school/finance/receipts/:paymentId`. **Print receipt** uses the browser print dialog and hides dashboard navigation, controls and footers. Receipt fields include payment reference, student/admission number, invoice, fee period/class, amount, method, external reference, payment date, recorder and posting time.
- The receipt stores the **balance immediately after that payment**, so later instalments/adjustments do not change that historical amount. The current school contact header is used for printing. Reversed receipts are clearly marked REVERSED and retain their original amount and reference. Browser printing requires manual visual verification in this environment.
- **Payments** and **Receipts** pages provide real, paginated records searchable by student, admission number, invoice/payment/external reference, with fee-period/class/status filters. Receipts are available for posted and reversed payments.

### Discounts, scholarships, adjustments and reversals

Only authorised, active School Administrator accounts with completed password setup can read/manage finance, collect payments, adjust invoices or reverse payments. These are the existing school's administrative permissions; no cashier role, separate finance user account or parent access is added. Super Admin is denied these school operational routes. Every actor is derived from the server-side User, never request-supplied.

- **Discount / adjustment** on the invoice account offers Discount, Scholarship or Adjustment. Discounts/scholarships are positive credits with a required reason. Their cumulative value cannot exceed the original gross bill. A positive adjustment adds charges; a negative adjustment credits fees. Adjustment/discount entries are appended with reason, actor and posting time, never edited/deleted. Revision checks prevent stale browsers from applying an entry to a changed account, and retry keys prevent duplicate credits.
- Invoice balance = **gross billed - discounts/scholarships + signed adjustments - net payments**. Negative balances, overpayments and over-crediting are blocked. Paid invoices cannot have their original fee lines changed. A credit to a fully paid invoice is rejected; reversing a mistaken payment or adding an authorised new charge is an explicit audited operation.
- **Reverse** on a posted payment requires a reason and confirmation. Reversal retains the original payment amount, receipt, reference, posting data and method; it marks the payment reversed, records reversal actor/time/reason, reduces net paid and reopens the invoice balance in the same transaction. It appends an immutable audit event with before/after balances. A second reversal returns 409, so retries cannot reverse money twice. An accounting reversal does not initiate a bank refund or transfer.
- Financial profile/configuration records, structures, invoices, payments, entries and audits have no permanent-delete path. Category/method options may be deactivated; historical used structures remain retained. Invoice detail shows the full invoice event history. The school-wide audit endpoint also includes configuration/version events.

### Exact monetary calculations and data integrity

The current module uses **NGN**, with all stored amounts as integer **kobo**. API monetary input must be decimal strings such as `"1000.25"`, with at most two decimal places; JavaScript numbers, exponent notation, grouping separators, zero charges/payments and invalid signs are rejected. Each amount/invoice is capped at **1,000,000,000,000 kobo (?10,000,000,000.00)**. No floating-point naira arithmetic is used: parsing, sums, comparisons, report totals and category allocations use BigInt, with checked conversion to safe-integer model fields. Aggregate report/statement monetary totals are serialized as exact minor-unit strings and formatted without floating-point conversion in the browser.

Every new financial model has a required schoolId. All financial queries, references, receipts, statements, statistics and audit lookups derive schoolId from the authenticated administrator and enforce that scope. Student, session, term, class, category, structure, invoice and payment references are checked server-side. All related writes share the existing per-school MongoDB transaction lock: invoice changes, payment/reversal records and audit events commit together or not at all. Unique indexes protect current fee structures, student-period invoices, generated payment references, retry keys and supplied external references. No raw financial record is deleted by an API.

### Dashboard, reports and student statements

**Financial reports** (`/school/finance/reports`, also the `/school/finance` landing page) shows real total gross fees billed, net payments received, outstanding balance, discounts/scholarships and signed adjustments. Empty databases produce actual zero totals; failed requests display errors. Reports are filtered by fee session/term/class, paid/outstanding state and student/reference search. Filters describe billed academic periods, not bank settlement or cash-book reporting periods.

Collection tables group by term, class and fee category, and paginated matching invoices link to their accounts. Category reporting apportions each invoice's aggregate discounts and adjustments across its billed categories, then allocates net paid across the resulting net category charges. Exact largest-remainder kobo allocation ensures category values reconcile to invoice totals, including tiny instalments and reversals. This is a disclosed proportional allocation, not a claim that payers earmarked cash to particular categories.

**Choose student statement**, or the statement link on an invoice, opens an individual student ledger, including inactive/archived students. Statements include original invoice debits, credit entries, signed adjustments, original payment credits and separate reversal debits; reversed original payments remain visible. Running balances use actual posting order and integer arithmetic, and reconcile to filtered invoice balances. Payment value dates are retained separately from posting timestamps. Student birth dates, residential/guardian/emergency details and passwords are not exposed by finance APIs.

| Method     | School finance endpoint                                | Purpose                                                                                                      |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| GET        | `/api/school/finance/context`                          | Own-school financial options and academic reference labels; NGN and School Administrator finance permissions |
| GET / POST | `/api/school/finance/categories`, `/methods`           | List/create school fee categories or custom methods; method lists also include built-ins                     |
| PUT        | `/api/school/finance/categories/:id`, `/methods/:id`   | Edit option name/status, with audit                                                                          |
| GET / POST | `/api/school/finance/structures`                       | Paginated current structures / create; `history=all` includes retained versions                              |
| PUT        | `/api/school/finance/structures/:id`                   | Revision-checked edit/version of a current structure                                                         |
| GET / POST | `/api/school/finance/invoices`                         | Paginated invoices / generate unique student-period invoice                                                  |
| GET        | `/api/school/finance/invoices/:id`                     | Account, original lines, payments, entries and invoice audit                                                 |
| POST       | `/api/school/finance/invoices/:id/entries`             | Reasoned discount/scholarship/signed adjustment with revision and retry key                                  |
| GET / POST | `/api/school/finance/payments`                         | Paginated payment history / idempotent payment recording                                                     |
| POST       | `/api/school/finance/payments/:id/reverse`             | Reasoned, audited single reversal                                                                            |
| GET        | `/api/school/finance/payments/:id/receipt`             | Authorised receipt, school header and historical post-payment balance                                        |
| GET        | `/api/school/finance/reports`                          | Exact totals, term/class/category groups and paginated accounts                                              |
| GET        | `/api/school/finance/students/:id/statement`           | School-scoped individual posting ledger, totals and running balances                                         |
| GET        | `/api/school/finance/audit`                            | Paginated school financial audit records                                                                     |
| DELETE     | Category/method/structure/invoice/payment `/:id` paths | Own records return 405; nothing is permanently deleted                                                       |
| PUT        | `/api/school/finance/invoices/:id`                     | Returns 405; issued lines/periods cannot be overwritten                                                      |

Lists/reports accept appropriate `sessionId`, `termId`, `classId`, `studentId`, `search`, `status`, `page` and `limit` filters; page defaults to 1, limit to 10 and is capped at 50. Structures reject student/status filters. Invoice/report status values are `paid` or `outstanding`; payment status values are `posted` or `reversed`. Unknown query/body fields are rejected, including schoolId, currency, actor and monetary-total injection. Use the statement path to choose its student rather than a conflicting query ID.

Request examples (IDs must belong to the signed-in administrator's school):

```json
{
  "sessionId": "<session-id>",
  "termId": "<term-id>",
  "classId": "<class-id>",
  "lines": [
    { "categoryId": "<category-id>", "amount": "1000.25", "compulsory": true }
  ]
}
```

Structure updates additionally supply the current integer `revision`. Invoice generation uses `studentId`, `structureId`, and an optional `optionalCategoryIds` array. Payment input:

```json
{
  "invoiceId": "<invoice-id>",
  "amount": "500.10",
  "methodId": "cash",
  "paidOn": "2026-11-24",
  "externalReference": "",
  "requestKey": "<unique-stable-UUID-for-this-submission>"
}
```

Method IDs may be `cash`, `bank_transfer`, `pos`, `other`, or an active own-school custom method ID. Invoice entries use `kind` (`discount`, `scholarship`, `adjustment`), decimal-string `amount`, `reason` (3 - 300 characters), current invoice `revision`, and a stable `requestKey`. Reversals use `{ "reason": "Recorded against the wrong account" }`. Reusing a retry key with different financial details returns 409; identical payment/entry retries return the existing result without reposting.

Changed files for Milestone 6:

| Area                                 | Files                                                                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Financial models                     | New `backend/src/models/Finance.js`: FinanceOption, FeeStructure, Invoice, Payment, InvoiceEntry, FinanceAudit and index initialization                                                                    |
| Backend validation and services      | New `backend/src/validation/finance.js`, `backend/src/services/money.js`, `backend/src/services/finance.js`                                                                                                |
| Routing and startup                  | New `backend/src/routes/finance.js`; updated `backend/src/routes/schoolWorkspace.js`, `backend/src/server.js`                                                                                              |
| Tests                                | New `backend/test/finance.test.js`                                                                                                                                                                         |
| Shared frontend finance helpers      | New `frontend/src/lib/finance.js`, `frontend/src/hooks/useFinanceContext.js`                                                                                                                               |
| Reusable frontend finance components | New `frontend/src/components/FinanceLayout.jsx`, `FinanceFilters.jsx`, `FinanceSummary.jsx`, `FinanceOptionManager.jsx`, `FeeStructureForm.jsx`, `InvoiceGenerationForm.jsx`, `FinanceTransactionForm.jsx` |
| Finance pages                        | New `frontend/src/pages/FeeStructures.jsx`, `StudentInvoices.jsx`, `InvoiceAccount.jsx`, `FinancePayments.jsx`, `PaymentReceipt.jsx`, `FinancialReports.jsx`                                               |
| Dashboard integration and styling    | Updated `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/pages/SchoolDashboard.jsx`, `frontend/src/styles.css`                                                                  |
| Documentation                        | `README.md`                                                                                                                                                                                                |

Verification: all **104 backend tests passed**, ESLint passed, and the frontend production build passed. All 89 previous tests remain green. Finance coverage includes category/custom-method setup, monetary/date validation, period/class references, fee structure edits and retained versions, invoice snapshots/duplicates, optional fees, partial/full/tiny-instalment payments, retry/reference uniqueness, reasoned discounts/scholarships/adjustments, stale revisions, over-crediting/overpayment prevention, immutable paid bills, reversals and actor/balance audit, statements/running balances, exact category reconciliation, reports/search/filters/pagination, concurrent collection limits, tenant isolation, role/password-change/active-account/school restrictions, and safe retention. Tests use isolated replica-set MongoDB and leave Atlas data untouched.

Outstanding verification: browser visual checks, including print-preview layout, remain manual in this environment. This is the requested manual school-fee ledger; online gateways, parent portals, and bank settlement integration are not implemented.

## Milestone 7: Examinations and results

### Testing the workflow

Run `npm run dev` using the existing backend environment. No new environment variables or dependencies are required. No examination data or teacher accounts are automatically inserted into Atlas.

1. Sign in as School Administrator and open **Examinations & Results**. Create an examination using the school's existing session, term, class and subjects. Configure assessment components, total marks, grading bands and optional class positions. An empty list and zero statistics represent real database state.
2. For teacher access, first use **Teachers & Staff** to assign an active teaching staff member the relevant classes and subjects. Open that staff profile and **Create teacher login**. Securely hand over the temporary password shown once. The teacher signs in at `/teacher-login`, changes the temporary password, and sees only assigned examination classes and subjects. Existing staff profiles do not automatically become login accounts. Staff assignment/profile/status changes revoke existing teacher sessions.
3. Open an examination, choose a subject and optional arm, and enter scores individually or save the changed rows together. Blank scores remain blank; they are never silently converted to zero. Correction of an existing score or teacher comment requires a reason. Each row exposes its retained revision history. Teachers can submit their subject/arm when complete; submitted rows are locked for teacher editing.
4. Administrators complete all subjects, add administrator comments and submit the whole examination. The sequence is **draft → submitted → approved → published**. Before submission, every current active student and every previously scored student must have all configured subjects completed. Submission freezes the cohort; partial report cards are not published. Resolve placement/status problems before submission rather than discarding historical scores.
5. Published student report cards are available from the result summary. Use **Print report card** for the browser print dialog. Cards show publication-time school/student labels, real component scores, totals, grades, remarks, subject averages, overall average, optional position, teacher/administrator comments and the recorded term attendance summary.
6. To correct submitted/approved/published results, an administrator reopens the examination with a reason, makes reasoned corrections, and submits/approves/publishes again. Previous publication numbers remain available and unchanged. The current summary shows current revisions; a report card explicitly identifies its publication snapshot.

### Calculation, history and permissions

Component weights must add up to **100%**. Component raw maxima are independent of the final total: `total = sum(raw score / component maximum × weight / 100 × configured total)`. Scores accept at most two decimal places. Backend calculations use exact BigInt ratios and round half up to hundredths; browser input never supplies calculated totals, grades or ranks. Grading bands have distinct minimum percentages/labels and must cover zero. Overall averages are means of subject percentages. Only students with all examination subjects completed appear in overall standings. Class positions include all arms, with competition ties **1, 1, 3**; positions can be disabled.

Configuration can be edited only while unused and draft. Once scores exist, assessment, subject and grading settings are preserved; **Duplicate configuration** creates a separate unused examination for changed rules. Result revisions retain original and changed marks/comments, status transitions, actor and reason. Publication snapshots preserve rules, marks, grades and attendance even after later configuration, student-profile or attendance changes. Attendance percentage uses recorded present/late/absent observations according to the existing attendance policy; excused and unmarked days do not become fabricated absences. No permanent examination/result deletion is provided.

Every new model and API query is scoped to the authenticated user's school. Administrator and teacher writes share existing school-level MongoDB transactions and revision checks. Teachers need an active linked teaching staff record and both class and subject assignments. They cannot configure examinations, approve/publish, read administrative summaries/report cards, access another teacher's unassigned subjects, or enter other school modules. School Administrators retain existing management permissions. Super Admin accounts retain their existing platform workspace and cannot enter school examination routes. Temporary teacher credentials use existing bcrypt, JWT HttpOnly cookies and mandatory first-password change.

### API overview

All examination paths below are under `/api/school/examinations` and require authenticated School Administrator or assigned Teacher access unless marked Administrator only. Unknown inputs and frontend-supplied school/actor fields are rejected.

| Path                             | Operations                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `/context`, `/`                  | GET scoped options and paginated searchable/filterable list with database statistics    |
| `/`                              | POST examination configuration (Administrator)                                          |
| `/:id`                           | GET scoped examination; PUT unused configuration (Administrator); DELETE returns 405    |
| `/:id/clone`                     | POST separate unused configuration (Administrator)                                      |
| `/:id/sheet`, `/:id/scores`      | GET paginated eligible/historical students; PUT individual or atomic bulk score changes |
| `/:id/submit-subject`            | POST complete subject/arm submission                                                    |
| `/:id/results/:resultId/history` | GET paginated retained score/comment/state revisions                                    |
| `/:id/state`, `/:id/summary`     | POST state transition; GET current subject/student summaries (Administrator)            |
| `/:id/comments/:studentId`       | PUT administrator comment with correction reason (Administrator)                        |
| `/:id/report-cards/:studentId`   | GET immutable published card, optional `publication` selector (Administrator)           |
| `/:id/audit`                     | GET paginated examination audit (Administrator)                                         |

Teacher provisioning uses Administrator-only GET/POST `/api/school/staff/:id/teacher-account`. Teacher login uses POST `/api/auth/teacher-login`; existing `/me`, `/change-password` and `/logout` flows are reused. No parent portal or online examination-taking endpoint is introduced.

### Changed files

| Area                                              | Files                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New database models                               | `backend/src/models/Examination.js`, `backend/src/models/Result.js` (Result, ResultRevision, ExaminationAudit, ResultComment, ReportCard)                                                                                                                                                         |
| New validation/calculations/services              | `backend/src/validation/examination.js`, `backend/src/services/resultCalculations.js`, `backend/src/services/examinations.js`                                                                                                                                                                     |
| New routes                                        | `backend/src/routes/examinations.js`, `backend/src/routes/teacherAccounts.js`                                                                                                                                                                                                                     |
| Authentication, startup and retention integration | `backend/src/models/User.js`, `backend/src/middleware/auth.js`, `backend/src/routes/auth.js`, `backend/src/routes/schoolWorkspace.js`, `backend/src/routes/staff.js`, `backend/src/services/staff.js`, `backend/src/routes/schoolConfiguration.js`, `backend/src/app.js`, `backend/src/server.js` |
| New integration tests                             | `backend/test/examinations.test.js`                                                                                                                                                                                                                                                               |
| New frontend helpers                              | `frontend/src/lib/examinations.js`, `frontend/src/hooks/useExamContext.js`                                                                                                                                                                                                                        |
| New reusable components                           | `frontend/src/components/ExaminationForm.jsx`, `ScoreEntry.jsx`, `ResultHistory.jsx`, `TeacherAccess.jsx`                                                                                                                                                                                         |
| New pages                                         | `frontend/src/pages/Examinations.jsx`, `ExaminationWorkspace.jsx`, `StudentReportCard.jsx`                                                                                                                                                                                                        |
| Existing frontend integration                     | `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/context/AuthContext.jsx`, `frontend/src/lib/navigation.js`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/StaffDetails.jsx`, `frontend/src/pages/SchoolDashboard.jsx`, `frontend/src/styles.css`                |
| Documentation                                     | `README.md`                                                                                                                                                                                                                                                                                       |

Verification completed: **118 backend tests passed**, including all 104 previous tests and 14 new examination test groups; **ESLint passed**; **frontend production build passed**. New coverage includes assessment configuration, exact weighted calculations, individual/bulk scoring, duplicates and invalid references, teacher permissions and session revocation, subject submission, averages and tied positions, ordered approval/publication, reasoned corrections/revisions, immutable report cards and real attendance, search/pagination and tenant isolation. Commands: `npm test`, `npm run lint`, `npm run build`. Integration tests use isolated replica-set MongoDB and do not modify Atlas records.

Outstanding verification: browser visual checks and report-card print preview remain manual in this environment. Vite reports a non-blocking JavaScript chunk-size warning (514.34 kB before gzip). Online examination taking and parent result portals are intentionally outside this milestone.

## Milestone 8 - Teacher dashboard and workspace

Teachers sign in at `/teacher-login` and land on `/teacher`. The responsive navy-sidebar workspace includes a database-backed overview, My Classes, My Subjects, a searchable and paginated academic student directory with restricted profiles, Attendance, Examinations & Results, My Profile, and Settings. Timetable, Assignments & Homework, and Announcements are explicitly labelled coming soon.

The overview includes school branding, active session/term, counts of assigned classes/subjects and unique active students, recorded attendance counts for explicitly permitted placements, examination/result counts and recent examination updates. Counts describe current assignments across stored sessions; selecting an attendance session and date determines the eligible roster. No fabricated attendance or sample dashboard statistics are used.

### Assignments and attendance authorisation

The existing `Subject.classId` relationship safely identifies each class - subject pair. Staff assignment validation already requires every subject to belong to a selected class. Selecting two classes and two subjects never creates four permissions: each subject remains attached to its own class. Existing class assignments cover every arm of that class for directory and examination access. This milestone does not introduce separate arm-limited subject assignments.

`Staff.attendanceGrants` is an additive array of `{ classId, arm }` (empty arm only for a class without arms). Existing teachers default to no attendance permissions. A School Administrator opens **Teachers & Staff ? staff profile ? Attendance permissions**, selects individual assigned class/arm placements and saves. Grants require active school-owned classes/arms and an active teaching staff record. Saving invalidates existing teacher sessions. Subject assignment alone grants no attendance permission. Removed class assignments cannot use retained attendance grants.

Attendance reuses the existing roster, report, marking, unique record index, revision conflict and correction audit implementation. Teachers select one explicitly granted placement, session and date; mark individuals or the current page in bulk; provide correction reasons; inspect previous dates and record revision history. Teacher attendance writes recheck grants inside the shared school transaction. Reports require a granted class and exact arm, including the empty-arm placement. Teachers cannot access staff attendance or delete records.

### API changes

All `/api/teacher` endpoints require an active teacher linked to active teaching staff, an active school, and a completed initial password change.

| Method    | Endpoint                                            | Purpose                                                                                                 |
| --------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET       | `/api/teacher/context`                              | School branding, assigned classes/arms and class-owned subjects, academic periods and attendance grants |
| GET       | `/api/teacher/dashboard`                            | Database statistics and recent relevant examination activity                                            |
| GET       | `/api/teacher/students`                             | `search`, optional `classId`, `page`, `limit` (maximum 50)                                              |
| GET       | `/api/teacher/students/:id`                         | Restricted assigned-class academic profile                                                              |
| GET/PATCH | `/api/teacher/profile`                              | Own employment summary; update phone only                                                               |
| GET       | `/api/teacher/attendance/student/roster`            | Existing roster contract, restricted to one granted placement                                           |
| PUT       | `/api/teacher/attendance/student`                   | Existing individual/bulk revision-aware marking contract                                                |
| GET       | `/api/teacher/attendance/reports`                   | Existing report contract; requires student kind and granted class/arm                                   |
| GET       | `/api/teacher/attendance/student/history/:personId` | Placement-scoped attendance history                                                                     |
| GET       | `/api/teacher/attendance/records/:id/audit`         | Authorised record revision history                                                                      |
| PUT       | `/api/school/staff/:id/attendance-grants`           | Administrator replaces explicit grants using `{ grants: [{ classId, arm }] }`                           |

Existing `/api/school/examinations` teacher score-entry, bulk entry and subject submission endpoints remain in use. Administrator-only approval/publication and finance permissions remain unchanged. Password changes reuse `/api/auth/change-password`, including current-password verification, bcrypt hashing, rate limits, compare-and-set protection and session replacement. Email is displayed read-only; administrators manage login email. Teachers may change phone only, never school, role, assignments, identity or employment status.

Student endpoints whitelist names, admission number, placement and academic status; they do not return guardian, medical, financial, address or private administrative fields. Authenticated responses retain `Cache-Control: no-store`. `TeacherAudit` adds transactional actor/time/before/after history for explicit attendance grant changes and personal phone updates; existing attendance and examination audits remain intact. No destructive database migration is required.

### CSRF and deployment

The existing production cookie fix in `backend/src/routes/auth.js` is preserved. All state-changing API requests require an exact trusted `Origin` matching `FRONTEND_ORIGIN`; requests without an Origin are rejected too. Credentialed CORS uses that same trusted origin. HttpOnly cookies prevent script access, but do not replace CSRF checks. Cross-site Render frontend/backend deployments still depend on the browser allowing the production session cookie: third-party-cookie blocking may prevent login even when SameSite/Secure and CORS are correct. Same-site custom domains or a same-origin API proxy are future deployment options. This milestone adds no dependencies or environment variables and performs no push or deployment.

### Offline preparation and limits

Teacher network access is behind `frontend/src/lib/teacher.js` and the shared Axios API abstraction. No offline functionality is implemented or claimed. Future local-server/device synchronization needs tenant/user scoped encrypted storage, explicit data expiry and logout cleanup, immutable operation IDs for retry deduplication, server revisions for conflicts, permission revalidation on reconnect, mandatory correction reasons and actor provenance, and atomic bulk reconciliation. Attendance dates/placements and score examination/subject/component revisions must be retained. Never indiscriminately cache authenticated API responses, passwords, cookies, guardian/medical records or financial data. Conflict resolution must preserve server audit history and never silently overwrite published results or attendance revisions.

### Manual verification

1. As a School Administrator, create or select active teaching staff, assign classes and their own subjects, and provision a teacher login. Select explicit Attendance permissions in the staff profile.
2. Sign in at `/teacher-login`, replace the temporary password, then verify school/session/term, overview counts, classes and subjects against the administrator records.
3. Search/filter/page My Students, open an academic profile and confirm private fields are absent. Direct requests for foreign students and unassigned class filters must fail.
4. Select a granted attendance placement/session/date. Mark individual students and a page in bulk. Reload, change a status without a reason (must fail), then with a reason, and inspect revision history. Select an earlier date to review attendance. An ungranted arm and staff attendance must be denied.
5. Enter and submit assigned examination scores. Confirm teachers cannot approve/publish results or open finance. Verify a subject from one assigned class cannot be used in another class.
6. Update the personal phone, change the password in Settings, then sign out/in. Verify identity, email, role and assignments remain read-only. Revoke grants or deactivate staff and confirm existing sessions lose access. Suspend a school and confirm access is denied.
7. Check the sidebar, filters, forms and horizontally scrolling tables at desktop, tablet and mobile widths. Check coming-soon pages and empty/error/loading states.

### Files and validation

Created: `backend/src/routes/teacher.js`, `backend/src/models/TeacherAudit.js`, `frontend/src/lib/teacher.js`, `frontend/src/pages/TeacherWorkspace.jsx`, `frontend/src/pages/TeacherAttendance.jsx`.

Modified: `backend/src/app.js`, `backend/src/models/Staff.js`, `backend/src/routes/teacherAccounts.js`, `backend/src/routes/attendance.js`, `backend/src/services/attendance.js`, `backend/test/examinations.test.js`, `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/components/TeacherAccess.jsx`, `frontend/src/pages/ExaminationWorkspace.jsx`, `frontend/src/styles.css`, and this README. The pre-existing uncommitted `backend/src/routes/auth.js` cookie change is retained.

Milestone 8 integration cases extend the existing isolated MongoMemoryReplSet examination fixture, covering authentication/role checks, database statistics, class-owned subjects, search/pagination and private-field omission, foreign/unassigned access denial, phone-only updates and origin checks, explicit grants and session revocation, individual marking, duplicate prevention, correction reasons/audit history, and inactive staff/suspended schools. Prior attendance tests also cover bulk atomicity and concurrency; prior examination tests cover teacher score entry and administrator-only approval/publication. Run `npm test`, `npm run lint`, and `npm run build`. Tests create local ephemeral MongoDB replica sets and never connect to Atlas. In restricted Windows environments Vite, Node's test runner and MongoDB require permission to start child processes.

Verification completed on 25 November 2026: the full backend suite passed **122/122 tests**; the final focused examination/teacher suite passed **18/18 tests**, including teacher bulk rollback and audit assertions; ESLint passed. The production frontend build passed. Vite reports a bundle-size advisory for the main JavaScript chunk (over 500 kB); code splitting is a future performance improvement. Interactive browser verification was not performed in this environment; use the manual steps above before production rollout. No Atlas data was modified, and no changes were pushed or deployed.

## Milestone 9 - Student dashboard and portal

### Completed student experience

Student sign in is available at `/student-login`, with school-specific branding when a school ID is selected, admission number, show/hide password, validation and administrator-assisted recovery instructions. Successful sign in leads to `/student/dashboard`, after the mandatory initial password change. Existing administrator and teacher login routes remain available.

The student workspace reuses the navy sidebar, cards, responsive tables, pagination, confirmation dialogs, authentication context, shared API boundary, money formatting and published report-card renderer. It includes an overview, read-only academic profile, active current-class subjects and explicitly assigned teacher names, personal attendance, published examination summaries and report cards, school-authorised fees and receipts, password settings and logout. Timetable, Assignments & Homework and Announcements remain clearly labelled coming soon. No parent or guardian portal is included.

The overview shows school branding, name/admission number/class/arm, enrolled session and its active term, active subject count, recorded personal attendance percentage, published-result count and recent publications, quick links and an optional fee balance. Missing attendance is never fabricated as absence; excused days retain the existing percentage-denominator rules. Attendance includes daily history, monthly summaries, session/term filters and pagination.

Results and printable report cards use immutable `ReportCard.snapshot` values for scores, components, grades, positions, attendance and published comments. They never recompute historical grades with current settings. Students receive only the latest publication of an examination that is **currently published**. Reopening/withdrawal immediately removes access through lists and direct card URLs; older superseded publications remain administrator-only. The shared report-card preview supports browser Print / Save as PDF. Class-wide subject-average arrays are omitted from student responses.

### Provisioning, identity and database additions

School Administrators open **Students & Admissions -> student profile -> Student Portal Account** to create an account, inspect its status/first-password-change flag, activate/deactivate it or reset its password. Actions use confirmation dialogs and transactional `StudentPortalAudit` records. Creation is explicit: no accounts are automatically created for existing students. Only active students may be provisioned, activated or reset. A reset leaves a deactivated account deactivated until explicitly activated.

Student login uses the school's existing unique MongoDB ID (shown to the administrator in the account section) plus the school-scoped admission number, normalised to uppercase. Admission numbers are not treated as globally unique. Students do not need an email address. To preserve the existing required unique User email index without a destructive migration, student accounts carry an internal reserved `student-<studentId>@portal.invalid` value. This is not a personal email, is never used for delivery/recovery, and is omitted from student authentication responses. Students authenticate through the admission-number endpoint only.

Additive model changes:

- `User.role` includes `student`; `User.studentId` links exactly one school-owned student record. A partial unique `{ schoolId, studentId }` index for student accounts prevents duplicates. Model validation requires student school/link membership and rejects a student link on other roles. Existing teacher and email indexes remain intact.
- `School.studentFinanceEnabled` defaults to `false`; absent values on existing records are also treated as disabled.
- New `StudentPortalAudit` stores school/student (where relevant), actor, action, safe account-status details and timestamp for creation, activation, deactivation, reset and school-wide financial-visibility changes. Passwords/hashes are never stored in audit details.
- Startup waits for User and StudentPortalAudit index initialisation. No bulk data conversion, account creation or Atlas-data mutation is required.

Temporary passwords use 24 random bytes encoded as base64url and existing bcrypt cost 12. They are returned only by the successful create/reset response and shown only in the current administrator view; they cannot be retrieved later. Students must replace them before portal access. Reset and status actions increment session versions. Student enrolment status changes also invalidate linked student sessions, so reactivating an enrolment cannot resurrect an older session.

### New APIs

All student APIs derive school/student identity from the authenticated account, require active school/account/student records and enforce the initial password change. None accepts a client-selected student identity. Filters are strict; unexpected `studentId`, `personId`, role and tenant fields are rejected.

| Method  | Endpoint                                         | Purpose                                                                                         |
| ------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| POST    | `/api/auth/student-login`                        | `{ schoolId, admissionNumber, password }`, existing rate limiting and HttpOnly session issuance |
| GET     | `/api/school/students/:id/portal-account`        | Administrator-only account state and school/admission login identifiers                         |
| POST    | `/api/school/students/:id/portal-account`        | Administrator-only `{ action: "create" / "activate" / "deactivate" / "reset" }`                 |
| GET/PUT | `/api/school/student-portal-settings`            | Administrator-only school-wide financial visibility; PUT `{ enabled: boolean }`                 |
| GET     | `/api/student/context` or `/api/student/profile` | Whitelisted personal/academic profile, school branding and period choices                       |
| GET     | `/api/student/dashboard`                         | Personal database-backed subject/attendance/publication statistics and optional fee balance     |
| GET     | `/api/student/subjects`                          | Active subjects for current active class/arm/session; explicitly assigned teacher names         |
| GET     | `/api/student/attendance`                        | Own daily records, monthly totals and existing attendance calculation                           |
| GET     | `/api/student/report-cards`                      | Own currently published latest report-card summaries, used by Results and Report Cards          |
| GET     | `/api/student/report-cards/:id`                  | Own authorised published snapshot for scores and print/PDF preview                              |
| GET     | `/api/student/fees`                              | Own safe invoices, integer-kobo billed/paid/balance totals and permitted payment history        |
| GET     | `/api/student/fees/receipts/:id`                 | Own posted receipt; denied when visibility is disabled or payment reversed                      |

Attendance, card lists and fees accept optional `sessionId`, `termId`, `page`, `limit` (maximum 50). All personal data remains scoped independently of these filters. Password changes reuse `/api/auth/change-password`, including current-password validation, byte-length limits, bcrypt, rate limiting and compare-and-set session invalidation. Logout reuses `/api/auth/logout`.

School-wide student financial visibility is **disabled by default** and can be explicitly enabled/disabled in the student profile's portal section. When enabled, invoice/payment queries always include the authenticated student's school and ID. They preserve integer-kobo amounts and existing balances; status derives from the stored balance/paid amounts. Responses omit internal notes, request fingerprints, actor IDs, reversal reasons and school-wide totals. Reversed payments remain clearly marked in history but cannot be printed as valid receipts. Students cannot make financial mutations. No online payment gateway is implemented.

### Frontend routes

`/student-login`; `/student` redirects to `/student/dashboard`. Protected routes: `/student/dashboard`, `/student/profile`, `/student/subjects`, `/student/attendance`, `/student/results`, `/student/report-cards`, `/student/report-cards/:cardId`, `/student/fees`, `/student/fees/receipts/:id`, `/student/settings`, `/student/timetable`, `/student/assignments`, `/student/announcements`. The shared `/change-password` route supports students. Administrator and teacher workspaces remain role protected.

### Security, privacy and deployment

Private medical/guardian data, private address, date of birth and administrative notes are omitted from personal profile APIs. Students cannot update official records or select another student through an API parameter. Direct card/receipt requests enforce both school and student ownership. Only active enrolments/accounts and active schools pass authentication. Existing backend role checks continue to deny students access to staff, teacher, finance-management and examination-management routes.

Production authentication retains HttpOnly cookies, `Secure` in production and `SameSite=None` in production (`Strict` locally), the existing exact trusted-Origin check for every mutation, credentialed CORS and `Cache-Control: no-store` for API responses. No JWT is stored in localStorage. The student login shares the existing 10-attempt/15-minute limiter; tests use independent app instances where needed rather than weakening it. Cross-site cookie restrictions and third-party-cookie blocking can still affect separate Render frontend/backend domains; use the Milestone 8 deployment guidance. No new dependencies or environment variables are needed. No changes are automatically pushed or deployed.

### Future offline requirements

This milestone does **not** implement offline student access. Network access stays behind the shared Axios API and `frontend/src/lib/studentPortal.js`. A later local-school-server implementation must authenticate locally without exposing a centrally reusable password/token, securely synchronise only authorised published snapshots and read-only attendance, retain publication/version provenance, and promptly propagate withdrawal and access revocation. Device caches need encryption, school/student scoping, expiry, explicit logout deletion and protection against another pupil using the same browser/device. Shared devices must default to no durable personal-data storage. Never indiscriminately cache student API responses or sensitive finance/guardian information. Offline financial access requires a separately reviewed policy; no service worker or authenticated-record cache is introduced here.

### Manual testing

1. Sign in as School Administrator. Open an active registered student profile. Create a student login through its confirmation dialog. Securely note the school ID, admission number and one-time password; close/reopen the section to verify the password is not retrievable. A second create request must return conflict.
2. In a separate browser/private session, open `/student-login`. Sign in with those details and replace the temporary password. Verify redirect to `/student/dashboard`, branding, official profile, active subjects/teachers and database-backed counts. Verify administrator and teacher URLs remain inaccessible.
3. Review attendance with session/term filters, daily pagination and monthly summaries. Verify excused and unrecorded days are not treated as absences. Try another student's ID through direct API requests: no personal data should be returned.
4. Publish an examination through the existing administrator process. View that student's results and report-card preview, component scores and comments; use Print -> Save as PDF. Draft, submitted and approved results must remain absent. Reopen a published examination and verify its card becomes inaccessible through its direct student URL too.
5. Confirm School Fees is initially unavailable. Explicitly enable school-wide student fee visibility in the administrator's student profile section, then reload the student view. Compare invoice/payment integer amounts and balances with the finance module. Print an own posted receipt. Other students' receipts and reversed receipts must fail. Disable visibility and verify fee APIs and dashboard balances disappear.
6. Reset the password as administrator after verifying the student's identity. Existing student sessions must fail; the old password must fail; the new temporary password must require replacement. Deactivate/reactivate the account and confirm old sessions remain invalid. Deactivate/archive the enrolment or suspend the school and verify access is denied.
7. Check coming-soon pages, password settings and logout. Inspect mobile/tablet/desktop navigation, keyboard-accessible forms/dialogs, empty/error/loading states, report-card printing and receipt printing. Browser interaction and actual printing need manual verification in the target deployment.

### Milestone 9 file inventory

Created: `backend/src/models/StudentPortalAudit.js`, `backend/src/routes/studentAccounts.js`, `backend/src/routes/studentPortal.js`, `backend/test/studentPortal.test.js`, `frontend/src/components/StudentPortalAccount.jsx`, `frontend/src/lib/studentPortal.js`, `frontend/src/pages/StudentLogin.jsx`, `frontend/src/pages/StudentPortal.jsx`.

Modified for this milestone: `backend/src/models/User.js`, `backend/src/models/School.js`, `backend/src/middleware/auth.js`, `backend/src/routes/auth.js`, `backend/src/routes/schoolWorkspace.js`, `backend/src/routes/students.js`, `backend/src/app.js`, `backend/src/server.js`, `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/context/AuthContext.jsx`, `frontend/src/lib/navigation.js`, `frontend/src/pages/StudentProfile.jsx`, `frontend/src/pages/StudentReportCard.jsx`, `frontend/src/styles.css`, and this README. Existing uncommitted Milestone 8 work is retained. The replica-set fixtures in `backend/test/academic.test.js`, `backend/test/attendance.test.js`, `backend/test/examinations.test.js`, `backend/test/finance.test.js`, `backend/test/staff.test.js`, `backend/test/guardians.test.js`, and `backend/test/students.test.js` also allow 60 seconds for temporary MongoDB startup (previously the library default of 10 seconds); no assertions or isolation guarantees were changed.

### Verification and limitations

`backend/test/studentPortal.test.js` uses an isolated local `MongoMemoryReplSet`; it never reads the configured Atlas connection or changes production records. Temporary replica-set startup is allowed 60 seconds to avoid intermittent 10-second process-start failures on the Windows workspace. It covers provisioning/duplicate races, same admission numbers in different schools, first-password enforcement, hashes/cookies, database-backed dashboard/profile, subject and attendance visibility, published-only snapshots, withdrawal and supersession, financial opt-in and personal receipts, role/tenant/identity injection, password resets, account/enrolment session revocation, suspended schools and login rate limiting. Run `npm test`, `npm run lint`, and `npm run build`.

Interactive browser, mobile-device and physical/PDF-print verification remains manual. The existing Vite main-bundle size advisory remains a performance improvement opportunity. Attendance, report-card and invoice pagination currently slices a personal query in memory to calculate full summaries consistently; database-side aggregation/pagination is a future scaling improvement. School IDs are currently the existing 24-character school identifiers; friendly school codes are not introduced. No offline mode, payment gateway or guardian portal is implemented.

Final backend verification on 25 November 2026: **138/138 tests passed**, preserving all 122 existing tests and adding 16 student portal integration cases. The final clean full run completed with zero failures after increasing only the temporary MongoDB startup allowance. All automated database fixtures remained local and isolated; no Atlas data was modified.

Final frontend verification: ESLint passed and the production Vite build passed. Vite reported the existing main-chunk size advisory (approximately 546 kB before gzip); this is advisory, not a build failure. Interactive browser and print verification remains manual as described above. No changes were pushed or deployed.

## Milestone 9A - Advanced teacher, class and subject assignment management

### Architecture audit

Existing functionality reused:

- `Staff.classIds` / `subjectIds` and `Subject.classId` already prevent the normal administrator workflow from assigning a subject to an unrelated class. However, the arrays do not identify an academic session, term or specific arm, and cannot represent a separate lead class teacher.
- `Staff.attendanceGrants` already requires an explicit class/arm grant, separate from subject teaching. Existing attendance services provide unique records, atomic bulk marking, correction reasons, revision checks and `AttendanceAudit` history.
- Teacher accounts are linked to active teaching staff, use session versions, and are rejected when their school/account/staff access is unavailable. Existing examination services already validate school/class/subject membership, score components, result revisions and administrator-only approval/publication.
- `TeacherAudit`, the shared school configuration transaction lock, student enrolment records, the school administrator workspace, teacher workspace, student portal, shared API boundary, entity picker, modal, pagination and print/report components are retained.

New functionality adds period-aware exact assignment relationships, lead appointments, revision-checked changes, transfers, explicit period copying, an administrator overview and review workflow, arm-filtered teacher directories and corresponding examination/attendance enforcement. No competing permission sources apply to a single teacher: each staff record uses exactly one assignment mode.

### Assignment model and periods

`TeacherAssignment` stores school, teaching staff, academic session, optional term, class, exact arm, responsibility kind, optional subject, status, revision, source link, actors and timestamps. A `teaching` row contains exactly one subject; a `class_teacher` row contains no subject and designates the lead teacher. Selecting multiple subjects saves multiple explicit rows atomically. An empty arm is valid only for a class configured without arms. Subjects must be active and belong to the selected school/class; staff and class/arm must also be active for new/edited/copied/transferred allocations.

A null term deliberately covers all terms of one selected session. A concrete term must belong to that session. Teaching duplicates for the same teacher/class/arm/subject are prevented both for the same period and for overlapping term-specific/session-wide scopes. One active lead teacher may cover a class/arm for an overlapping academic period, regardless of teacher. Partial unique indexes protect exact active duplicates; the shared school transaction lock also protects overlaps and concurrent lead appointments.

Current teacher directories, group counts and subjects use active assignments in the active academic session and, for term-specific rows, the active term, with active academic configuration and active current enrolments. Several subjects in one class/arm produce one group and one count per student. New enrolments appear from live queries; moving a student changes current visibility without changing historical scores or attendance.

Examination access resolves the exact session, optional term, class, subject and arm. An active retained assignment can authorise its historical examination scope even when it is no longer a current dashboard responsibility. Explicit allocations can be prepared in an inactive future period; they do not populate current directories before activation. There is no automatic carry-forward. Teachers still cannot approve/publish results or access finance/administration. Lead class teacher appointments grant directory/responsibility access, not subject score entry or attendance.

### Administrator workflow

Open **Teacher Assignments** in the School Administrator sidebar (`/school/teacher-assignments`).

1. Search for and select an active teaching staff record using the shared entity picker.
2. Choose a session, optional term (or all session terms), class, exact arm and either subject teaching or lead class teacher responsibility.
3. Select one or more active class-owned subjects for teaching. Enter the reason, review the scope and confirm. Editing an existing subject row changes one subject relationship at a time.
4. Use the table to search teacher name/employee ID and filter teacher, class, subject, session, term and status. Term filtering also includes session-wide assignments covering that term. Table rows show employee, academic period, class/arm, subject, lead status, explicit attendance permissions, assignment/staff status and actions.
5. Edit using the current revision; stale changes are rejected. Deactivate to revoke access while retaining the row. Transfer creates an active linked successor for another active teacher and deactivates the old row; both teachers' sessions are invalidated. Transfer does not move attendance grants, scores, enrolments or report cards.
6. Inspect row History for reason, actor, time and before/after scope. Filter inactive assignments to inspect retained transferred/revoked sources.
7. Select rows and use **Copy selected assignments to another period**. Copying is explicit and atomic, validates current school-owned staff/class/arm/subject relationships, creates source-linked new records, and rejects duplicate/invalid selections rather than silently skipping them. Attendance grants are not copied. Existing source assignments and academic records remain intact.

All assignment changes are administrator-only, transactional, reasoned and audited. Affected teachers must sign in again after changes; stale in-flight score/attendance writes recheck authority inside the transaction. No permanent assignment deletion endpoint is provided.

### Attendance integration

The existing `Staff.attendanceGrants` array remains the only attendance grant store. It adds optional `sessionId` and `termId` fields. Explicit-mode grants require a selected period and a matching subject/lead assignment group. Subject teaching or lead designation alone never creates an attendance grant. Administrators separately grant or revoke attendance in the assignment overview. Revoking an assignment removes attendance access if no retained active assignment still covers that class/arm/period, even if a grant remains stored for history.

The table displays covering grants and offers separate revoke actions for term or session grants. A broader grant can remain after a narrower grant is removed; revoke every covering grant to remove all attendance permissions for that placement. Teacher attendance lists include authorised retained periods as well as current ones. Each request must fit both an active assignment scope and an explicit grant, including the attendance date or the full requested report range. A term-limited grant cannot authorise a report spanning outside that term; request smaller authorised ranges. Unscoped reports and staff attendance remain denied to teachers.

Existing duplicate prevention, correction reasons, revisions and audit records are reused. Assignment changes never rewrite `Attendance`, `AttendanceAudit`, `Result`, result revisions or published report snapshots. Historical attendance/score access is retained only while a corresponding active assignment/grant still authorises it; deactivation removes that access without deleting the data. Administrators retain historical access.

### Safe legacy compatibility and review

`Staff.assignmentMode` defaults to `legacy` for backward compatibility. Existing arrays/grants keep their existing permission behaviour until an administrator makes an explicit reviewed switch. They are **not** silently expanded into inferred historical period/arm rows. Legacy scope can still be broader than the new model; administrators should review these records before relying on arm/period restrictions for those teachers.

`GET /api/school/teacher-assignments/legacy-review` and the page's legacy review table flag records lacking confirmed period/arm data. Unavailable or mismatched subject/class links are explicitly flagged as ambiguous. The selected teacher's retained classes, subjects and grants are shown for review. For the first explicit save/transfer into a teacher, the administrator must confirm adoption (`adoptLegacy: true`). The switch and new records are committed together, with the original arrays/grants captured in `TeacherAudit` and retained in Staff.

After adoption, only explicit assignment records authorise that teacher. Legacy arrays are read-only history; revoking every explicit row **does not** reactivate legacy permissions. Unscoped legacy attendance grants no longer apply in explicit mode; confirm and create scoped grants separately. Staff profile maintenance can retain even ambiguous historical arrays without treating them as new permissions. The old staff form and attendance editor direct explicit-mode teachers to the dedicated page; backend checks also reject attempts to change their legacy assignment arrays or use the old unscoped grant endpoint.

Deployment requires only additive schema fields, the new collection/indexes and ordinary application startup index initialisation. No destructive migration script is supplied or run; no existing staff assignments are deleted, no historical periods are guessed, and no Atlas records are modified by automated testing. Review teachers in manageable batches and verify each period/arm/subject plan before switching. Existing uncommitted Milestones 8 and 9 work is preserved.

### API changes

All new administrator endpoints are mounted behind the existing authenticated School Administrator and mandatory-password-change checks at `/api/school/teacher-assignments`.

| Method | Relative endpoint | Purpose                                                                                           |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------- |
| GET    | `/context`        | School-owned session, term, class/arm and subject choices                                         |
| GET    | `/legacy-review`  | Searchable/paginated legacy staff review; missing/ambiguous scope warnings                        |
| GET    | `/`               | Search/filter/paginate assignment overview, staff status and covering attendance grants           |
| POST   | `/`               | Atomic teaching-subject batch or lead appointment, with reason and explicit adoption where needed |
| PUT    | `/:id`            | Edit one assignment with revision/reason; use transfer for teacher changes                        |
| POST   | `/:id/deactivate` | Revision-checked, audited soft revocation                                                         |
| POST   | `/:id/transfer`   | Audited source/successor transfer; optional explicit target adoption                              |
| POST   | `/copy-period`    | Explicit atomic copy of selected IDs into a different session/term                                |
| POST   | `/attendance`     | Explicit scoped grant/revoke using staff, period, class, arm, enabled flag and reason             |
| GET    | `/:id/history`    | Paginated assignment audit history with safe actor names                                          |
| DELETE | `/:id`            | 405: use audited deactivation; no deletion                                                        |

Create/edit fields: `staffId`, `sessionId`, optional `termId` (null/empty means session-wide), `classId`, exact `arm`, `kind` (`teaching` / `class_teacher`), `subjectIds`, `status`, `adoptLegacy`, `reason`; edit also requires `revision`. The transfer body contains target `staffId`, source `revision`, `reason`, optional `adoptLegacy`. Copy accepts `ids`, target `sessionId`/`termId`, and `reason`. Attendance accepts `staffId`, `sessionId`/`termId`, `classId`, `arm`, `enabled`, `reason`. Overview filters: `staffId`, `classId`, `subjectId`, `sessionId`, `termId`, `status`, `search`, `page`, `limit` (maximum 50). Requests reject unknown/mass-assigned fields and foreign school references.

Existing teacher endpoints keep their URLs. Explicit-mode `/api/teacher/context` adds exact current `groups`, subject/group relationships, lead responsibilities and scoped attendance choices. `/dashboard` adds unique class/arm group count, teaching assignment count, lead responsibility count and current attendance permission count while retaining existing statistic keys. `/students` adds an optional exact `arm` filter and intersects all filters with authorised current groups; personal student reads enforce the same scope. Examination list/detail/sheet/score/submission/result-history endpoints enforce exact explicit relationships, and details include permitted arms per subject for the score-entry controls. The student portal's subject-teacher names also respect explicit period/arm relationships; retained legacy arrays cannot leak another arm's teacher into that listing.

### Audit and model changes

- New `TeacherAssignment` model and active-duplicate / lead-appointment indexes.
- `Staff.assignmentMode` (`legacy` / `explicit`) and optional academic period fields on existing attendance grants.
- `TeacherAudit` adds an assignment reference, reason and creation/update/revocation/transfer/copy/adoption action types, while preserving existing contact/grant events.
- Assignment service writes reuse the shared school configuration transaction lock and existing User session versions. Server startup waits for assignment and teacher-audit indexes.
- Authentication cookies, JWT format, CSRF Origin enforcement, school suspension checks, existing role boundaries, student portal financial defaults and `Cache-Control: no-store` remain unchanged. No new dependencies, environment variables or cloud services are introduced.

### Future offline synchronization

No offline capability is implemented. A future local-server/device synchronisation layer must carry tenant/staff identity, assignment IDs and revisions, source links, session/term/class/arm/subject scope, grant changes, enrolment transfers, actor/reason and revocation events. Permission revocation and account session-version updates must invalidate stale cached rosters and prevent queued attendance/score writes from bypassing server checks. Conflicts must be resolved against current authoritative assignment and enrolment revisions without altering historical audit/snapshot data. A period copy or transfer must remain atomic and retry-safe, and must never infer attendance permissions. Do not indiscriminately cache authenticated rosters or academic records on shared devices.

### Manual browser verification

1. As a School Administrator, open Teacher Assignments. Search/select an active teacher. Review legacy warnings and the retained arrays; create Mathematics for Primary 4 Gold in the active session/term and English for Primary 5 Silver, confirming explicit adoption. Verify two exact groups, correct subjects and unique student counts in the teacher's newly authenticated workspace.
2. Try an unrelated class subject, invalid arm, foreign-school ID, inactive staff member and duplicate/overlapping assignment through direct API requests. They must fail without partial rows or an unintended adoption.
3. Appoint a lead class teacher for a separate arm. Attempt an overlapping lead appointment; it must fail. Confirm the lead teacher sees eligible students but gains neither subject scoring nor attendance automatically.
4. Grant attendance explicitly for one authorised period/arm. Mark individuals/bulk entries, correct with a reason, inspect revisions, and try an ungranted arm/period or a report crossing the permitted term. Duplicate writes and unauthorised requests must fail.
5. Enrol a student in an assigned group and reload My Students. Transfer that student to an unassigned group; current visibility must change. Existing authorised historical sheets/attendance stay attached to the original recorded placement, with transferred students not editable as current examination entrants.
6. Edit an assignment's arm or subject and verify stale revisions are rejected. Transfer an assignment to another teacher and inspect both source/successor histories. Confirm old sessions are invalidated, no attendance grant moved automatically, and no financial/approval access was granted.
7. Revoke the final explicit assignment for an arm. Even though legacy arrays or an old attendance grant remain stored, directory, scoring and attendance access for that scope must disappear. Verify historical database records remain available to administrators.
8. Select valid rows and copy to another period. Duplicate or invalid copies must roll back atomically. Activate the target period using the existing academic management workflow and enrol students appropriately; only explicitly allocated responsibilities appear. Old lead appointments and grants must not silently carry forward.
9. Check table search, filters, pagination, multi-select subjects, active-teacher picker, empty/error/loading/success states, keyboard-accessible dialogs, mobile/tablet layouts, and teacher class/arm filtering. Verify the student portal shows teacher names only for the student's own explicit arm/period. Existing administrator, teacher and student login routes and published report cards must still work.

### Milestone 9A file inventory

Created: `backend/src/models/TeacherAssignment.js`, `backend/src/validation/teacherAssignment.js`, `backend/src/services/teacherAssignments.js`, `backend/src/services/teacherAccess.js`, `backend/src/services/teacherWorkspace.js`, `backend/src/routes/teacherAssignments.js`, `backend/test/teacherAssignments.test.js`, `frontend/src/lib/teacherAssignments.js`, `frontend/src/pages/TeacherAssignments.jsx`.

Modified for 9A: `backend/src/models/Staff.js`, `backend/src/models/TeacherAudit.js`, `backend/src/middleware/auth.js`, `backend/src/server.js`, `backend/src/routes/schoolWorkspace.js`, `backend/src/routes/teacherAccounts.js`, `backend/src/routes/teacher.js`, `backend/src/routes/examinations.js`, `backend/src/routes/studentPortal.js`, `backend/src/services/staff.js`, `backend/src/services/examinations.js`, `backend/src/services/attendance.js`, `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/components/EntityPicker.jsx`, `frontend/src/components/StaffForm.jsx`, `frontend/src/components/TeacherAccess.jsx`, `frontend/src/components/ScoreEntry.jsx`, `frontend/src/pages/TeacherWorkspace.jsx`, `frontend/src/pages/TeacherAttendance.jsx`, `frontend/src/styles.css`, and this README. Earlier milestone changes remain in the working tree.

### Verification and remaining limitations

The new assignment integration fixture uses a separate local `MongoMemoryReplSet` with a 60-second startup allowance, fixed test configuration and no Atlas connection. Cases cover multiple subjects/classes, explicit arm/subject/period enforcement, lead appointment uniqueness/concurrency, duplicate and invalid scopes, automatic/unique student visibility, inactive students and transfers, grant/correction/audit protections, cross-school/role isolation, score/result-history restrictions, revision conflicts, source-linked transfers/copies, period transitions, student-portal teacher names and ambiguous legacy retention/profile maintenance. Run all backend tests with `npm test`, plus `npm run lint` and `npm run build`.

Interactive browser/mobile/printing verification remains manual. Legacy teachers require administrator review/adoption before new arm/period restrictions replace their old broad permissions. Existing exact Subject records are class-owned; subjects with the same display name in different classes remain distinct records. This milestone does not introduce a timetable or subject-catalogue migration. Large-school permission/context and historical-summary queries can be optimised with targeted aggregation/caching in a later milestone; no authenticated cache is added now. The existing Vite main-bundle advisory remains a performance improvement opportunity. No printable forms, admission application tracking or parent portal was started, and nothing was pushed or deployed.

Final Milestone 9A verification on 25 November 2026: **158/158 backend integration tests passed**, including all 138 previous tests and 20 new assignment cases. ESLint passed, the production Vite build passed, and the whitespace check passed. Vite retains its main-bundle advisory (about 568 kB before gzip); interactive browser/mobile checks remain manual. Automated databases were isolated local replica sets. No Atlas data or environment files were modified, and nothing was pushed or deployed.

## Milestones 9B and 9C - Printable registration forms and admission applications

### Architecture and completed workflows

The new School Administrator **Forms & Documents** and **Admission Applications** pages extend the existing application. They reuse school branding, authenticated API access, the navy workspace, entity pickers, modal confirmations, pagination, student registration, guardian records/relationships and the shared school transaction lock. Current Student session/class/arm fields remain the authoritative current enrolment representation; no competing enrolment table or teacher-student assignment system is introduced. Existing attendance, exact teacher assignments, finance and published report cards remain intact.

Administrators can issue a numbered student application without registering a student; print/reprint it; save partial returned data; record receipt; review/approve/reject; cancel/withdraw; and atomically convert an approved application into one registered student with verified guardian links. Account provisioning stays separate and optional. Issuing any form creates no student, parent, staff or privileged account and changes no teaching/attendance permissions.

### Printable inventory and categories

All templates have school-specific name/logo/address/contact details, handwriting space, signature/date areas, reference and issue date where tracked, template version and explicit page numbers. Printed footers identify the school; developer branding appears only in application footers. The preview uses locally rendered A4 pages and browser Print / Save as PDF; no external PDF service is used. Multi-page student forms include separate personal, guardian, safety/checklist, declaration/privacy and official review sections. Long safety text uses referenced continuation pages.

| Category                 | Printable document                             | Issued reference code |
| ------------------------ | ---------------------------------------------- | --------------------- |
| Admissions               | Student Application Form                       | APP                   |
| Admissions               | Admission Acceptance Letter                    | ACC                   |
| Family and safety        | Parent and Guardian Registration Form          | PAR                   |
| Family and safety        | Student Medical and Emergency Information Form | MED                   |
| Staff and administration | Teacher Registration Form                      | TCH                   |
| Staff and administration | Non-Teaching Staff Registration Form           | STF                   |
| Staff and administration | School Administrator Registration Form         | ADM                   |
| Staff and administration | Teacher Class and Subject Assignment Form      | ASN                   |
| Student records          | Student Transfer Form                          | TRF                   |
| Student records          | Student Withdrawal Form                        | WDR                   |
| Student records          | Student Clearance Form                         | CLR                   |

Generic templates are clearly marked **GENERIC TEMPLATE - UNTRACKED / NOT ISSUED** and receive no reference or application record. Numbered student application forms are issued through the application workflow, not through an unrelated document-only operation. Other numbered forms can be blank or explicitly prefilled from authorised existing records. Teacher assignment printouts use actual 9A relationships; legacy arrays are not expanded into guessed periods or arms.

Acceptance letters require an approved/enrolled application or an active admitted student. Their approval information comes from actual records; signatures and stamps remain blank. Transfer/withdrawal forms collect a request and official review without automatically changing enrolment. Clearance forms contain unsigned departmental review fields and do not certify a balance or implement fee-access restrictions. Administrator forms contain no passwords and grant no roles: Super Administrator account-provisioning authority is unchanged. Existing employee IDs and other permanent identifiers are not replaced by application references.

### Numbering architecture

School Administrators configure the prefix (2-12 uppercase letters/digits, beginning with a letter), privacy notice and supporting-document checklist in Forms & Documents. The default prefix is `SCH`; configure the school's preferred prefix before normal issuance. Example: `BFIS/APP/2026/0001`. Permanent application-generated admissions use a separate `STD` sequence, for example `BFIS/STD/2026/0002`.

`DocumentCounter` is keyed by **school + kind + issue year**. The issue year comes from the server using Africa/Lagos time; reference numbers are never calculated from document counts or browser state. `$inc` allocates the sequence inside the existing school transaction. `ReferenceReservation` permanently records the number, kind, year, sequence and an opaque target ID with unique school/reference and school/kind/target indexes. Application and issued-document collections also enforce unique school/reference and school/request-key indexes.

The counter namespace intentionally does not include the prefix. Changing a prefix does not reset the year's counter; old references remain unchanged. Cancelled/withdrawn/rejected application references and cancelled document references remain reserved permanently and are never recycled. Reprinting uses the same document record, reference and original issue date, without incrementing the numbering counter. Permanent `STD` generation skips admission numbers already used by existing students, including inactive/archived records. No old admission number or employee ID is renumbered.

Every application/document also has its own immutable internal ObjectId, separate from its human reference. Human references are unique **within a school**; different schools may choose the same prefix and own independent sequences. API identity and access always use authenticated school membership and opaque record IDs, never a public globally trusted reference string.

Generation requests use a client-generated random request key for retry deduplication, not for reference numbering. Repeating the same key/input returns the existing record; changing its input returns conflict. Uncommitted transactions that fail issue no reference to the caller. Counter changes/reservations roll back with a failed conversion; already committed/cancelled references remain reserved. A bounded collision check protects existing manual admission IDs; no API resets/decrements counters.

### Application workflow and atomic enrolment

| Current status                   | Permitted workflow actions                                         |
| -------------------------------- | ------------------------------------------------------------------ |
| Awaiting completed form          | Record form received, withdraw, cancel                             |
| Form received                    | Start review, withdraw, cancel                                     |
| Under review                     | Approve, reject, return to form received, withdraw, cancel         |
| Approved                         | Enrol through conversion endpoint, reopen review, withdraw, cancel |
| Rejected                         | Explicitly reopen review                                           |
| Withdrawn / Cancelled / Enrolled | Retained terminal workflow record                                  |

Draft saves do not automatically advance status. Incomplete personal/guardian information can be saved while awaiting, received or under review. Approval requires a known student name and a valid school-owned class/arm. Full student/contact/guardian validation occurs at enrolment. Approved/rejected details must be reopened for review before editing; enrolled, withdrawn and cancelled application data remain read-only. Restricted student safety information is maintained separately with its own revisions and audit events.

Initial generation validates the intended session and any known class/arm. Approval can be prepared for a future session, but conversion uses existing registration validation and requires an active school, session, class and arm. To change an approved class/arm, reopen review, edit and approve again; enrolment does not silently override the approved placement.

Conversion is one MongoDB transaction using the existing school lock. It validates the approved status/revision, student information and placement; reserves a permanent `STD` number; calls the existing student registration service inside the same transaction; links verified existing guardians or explicitly confirmed new guardians through the existing guardian services; links any safety record; records the originating application ID/reference on Student; and changes the application to Enrolled with its student and guardian IDs. No login accounts are created.

`Student` has a partial unique school/application index. Conversion retries are idempotent by application identity and an enrolment fingerprint of admission date/approved placement. Concurrent identical requests produce one student and return that same conversion; changed retry details return conflict. Invalid guardian data or placement rolls back the student, links, reference reservation and counter changes. Application-generated admission numbers are locked in the registration service and shown disabled in the student editor. Direct student registration remains available and existing identifiers/records are preserved.

Newly enrolled active students appear automatically in authorised teacher queries because those queries use actual current enrolment and exact 9A period/class/arm groups. Original application references can retrieve the linked student or application. Student and application search also supports admission numbers, names, guardian names/phones, session/class/arm and workflow filters with pagination.

### Guardian verification and student safety

An application can contain up to six guardian entries. Administrators search existing guardian records, verify identity and relationship, and explicitly select an existing ID or confirm that a new record is appropriate. Every enrolment guardian entry needs the administrator's verification confirmation. A shared phone number never automatically matches or merges people. Selecting an existing guardian links that record without overwriting its contact details; update the canonical guardian profile separately when needed. One verified guardian can link to multiple children using existing unique `StudentGuardian` relationships. Guardian registration printouts can show those linked children.

`StudentMedical` is a separate, School-Administrator-only collection for relevant allergies, conditions, guardian-provided safety instructions and emergency contacts. It can be associated with an application before enrolment and linked to the registered student in the conversion transaction. Existing directly registered students can also have an authorised safety record. The administrator must explicitly open this panel; reads and revision-checked changes are audited. Medical values are not copied into general application audit details, ordinary application lists/details, teacher directories, student APIs or public links.

Medical content is omitted from application reprint prefills by default. Administrators explicitly opt in for application/safety printouts. Unrelated form types cannot include it. Any issued snapshot deliberately containing medical data remains an administrator-only confidential document; protect exported/printed copies under school policy. This milestone adds no medical guidance, public file storage, scanned attachments or automatic health-data sharing.

### Printing and document history

Issued documents store an immutable reference/type/template version and issuance snapshot, linked application/student/guardian/staff IDs where applicable, issuing administrator, issue timestamp and status. The catalogue and history list return minimal metadata rather than personal snapshots. Snapshot and prefill access is authenticated and tenant scoped. Original school branding/notice/checklist remain attached to the issued application even after school settings change. An optional current application prefill records the source application revision for the print request.

Use **Prepare and log print request**, review the resulting preview, then **Print / Save as PDF**. Each preparation records a print/reprint-request event and retains the reference. `physicalPrintConfirmed` is explicitly false: browser preparation or print-dialog use does not prove successful physical printing. Native browser printing cannot be treated as an authoritative delivery/receipt signal. Cancelled/withdrawn/rejected application copies and cancelled documents are clearly marked as retained copies in the preview.

Print CSS removes navigation, dashboard controls and buttons, uses a named A4 page with 10 mm margins, repeats school/reference/page information and leaves authentic signature/stamp areas empty. Preview every page before printing, disable browser-generated headers/footers if they overlap the form, and verify local printer scaling/margins. Uploaded school logos are served by the application from MongoDB; legacy external logo URLs still require connectivity. No private data is encoded into a QR code or placed in a public document URL.

### Database model and service changes

New models in `backend/src/models/Admissions.js`:

- `DocumentCounter`: atomic school/kind/year sequences.
- `ReferenceReservation`: immutable, unique, permanently reserved human references with internal target IDs.
- `IssuedDocument`: immutable issuance snapshots/references, links, template version, issuer, cancellation state and print-request metadata.
- `AdmissionApplication`: intended placement, draft student/guardian data, issued checklist, workflow/revision, original reference and conversion links.
- `StudentMedical`: isolated minimal safety information with application/student unique links and revision control.
- `AdmissionAudit`: document, workflow, settings, verification/conversion and medical-access/update events with actor/time/reason.

`School` adds the document prefix, school privacy notice and configurable checklist. `Student` adds immutable application ID/reference metadata and indexes, without backfilling or requiring it for existing direct registrations. Shared student and guardian services accept an internal existing transaction so conversion reuses validation without nesting transactions. Public registration calls still create their own transaction as before. The API JSON body limit is now a bounded 64 kB to accommodate partial forms with several guardians.

### API endpoints

All routes below are under `/api/school` and require an authenticated, active School Administrator, an active school and completed mandatory password change. Existing cookie, exact trusted-Origin CSRF checks, credentialed CORS, session invalidation and `Cache-Control: no-store` remain intact.

| Method   | Endpoint                       | Purpose                                                                                        |
| -------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| GET      | `/applications/options`        | School-owned sessions/classes/arms and workflow choices                                        |
| GET      | `/applications/dashboard`      | Actual application counts by status and combined withdrawn/cancelled total                     |
| GET/POST | `/applications`                | Search/filter/page applications, or issue one using request key and intended session/class/arm |
| GET/PUT  | `/applications/:id`            | Read authorised draft and linked-student summary, or save revision-checked partial details     |
| POST     | `/applications/:id/status`     | Valid status transition with revision and reason                                               |
| POST     | `/applications/:id/enrol`      | Atomic/idempotent approved-application conversion                                              |
| GET      | `/applications/:id/history`    | Paginated workflow/document/safety-access metadata with actor names                            |
| GET/PUT  | `/applications/:id/medical`    | Explicit restricted safety read/update with revision/reason                                    |
| DELETE   | `/applications/:id`            | 405: use audited cancellation/withdrawal; history is retained                                  |
| GET      | `/forms/catalog`               | Categorised document inventory and current school form settings                                |
| PUT      | `/forms/settings`              | School prefix/privacy notice/checklist settings; audited                                       |
| GET      | `/forms/templates/:type`       | Branded generic template without a reference or personal source data                           |
| GET/PUT  | `/forms/students/:id/medical`  | Restricted safety information for a registered student                                         |
| GET/POST | `/documents`                   | Search/page issued metadata, or issue an allowed numbered document                             |
| GET      | `/documents/:id`               | Tenant-owned issuance snapshot and linked application status                                   |
| POST     | `/documents/:id/prepare-print` | Log print/reprint preparation; optional current application/medical prefill                    |
| POST     | `/documents/:id/cancel`        | Reasoned/revision-checked cancellation; reference remains reserved                             |
| GET      | `/documents/:id/history`       | Paginated generation/cancellation/print-request history                                        |

Application creation body: `requestKey`, `sessionId`, optional `classId`, optional `arm`. Draft body: `revision`, `sessionId`, optional `classId`/`arm`, `student`, `guardians`, `receivedDocuments`. Workflow body: `revision`, `status`, `reason`. Enrolment body: `revision`, `admissionDate`, approved `classId`, `arm`. Document issuance body: `requestKey`, `type`, optional compatible `applicationId`/`studentId`/`guardianId`/`staffId`/`administratorId`/`sessionId`, `prefill`, `includeMedical`. Unknown fields, client-selected references, incompatible source types and cross-school IDs are rejected.

Application filters: `search`, `sessionId`, `classId`, `arm`, `status`, `page`, `limit` (maximum 50). Issued-document filters: `search`, `type`, `page`, `limit`. Registered-student search now includes original application reference and guardian name/phone; `applicationStatus` is an additional optional student-list filter. Old list parameters remain valid.

### Frontend routes

School Administrator only: `/school/applications`, `/school/applications/:id`, `/school/forms`, `/school/forms/templates/:type`, `/school/documents/:id`. Students & Admissions links to Applications and Forms, supports application-status filtering and retains direct registration. Student profiles link back to the original application where available and offer an explicitly opened restricted medical panel. No public application submission endpoint or parent portal is introduced.

### Migration and deployment

Changes are additive. Startup initialises the new collection/indexes; existing students need no application ID, existing guardians/employee IDs remain unchanged, and old references are not rewritten. Review the prefix, privacy notice and checklist before normal use. The numbering and conversion operations require transaction-capable MongoDB (the existing Atlas deployment or a properly configured local replica set). A standalone local MongoDB server without transaction support is not a supported fallback; do not split conversion into unsafe independent writes.

No migration or automated test connects to or rewrites existing Atlas records. No new runtime dependencies, environment variables, PDF services or storage accounts are required. Existing uncommitted milestone work and production cookie settings are preserved. Nothing is automatically pushed or deployed.

### Future offline synchronization and private attachments

Generation, numbering, form rendering and browser printing use the application/local database and no online numbering/PDF service. This does **not** implement full offline authentication or device/cloud synchronization. Independent local and cloud writers must not both allocate from the same unconstrained sequence. A future design should use a single authoritative allocator, leased/reserved non-overlapping ranges, or a deliberately versioned server/site namespace, with immutable global operation/entity IDs, tenant scope, durable reservation ledgers and conflict detection. Prefix changes alone do not solve offline collisions. Cancelled numbers must stay reserved; retries must reconcile the original operation, not allocate a replacement.

Conversion and guardian verification need synchronized application revisions, student origin links, trusted identity matching, permission revocation and atomic conflict resolution. Shared devices require authenticated tenant-scoped access, encryption/expiry where caching is later authorised, logout cleanup and no indiscriminate caching of personal/medical records. Future scanned-document attachments require private storage, authenticated access, file/type/size validation, malware handling, retention/deletion policy and audited access; no public object URLs or upload API are added here.

### Future Milestone 10 and fee-clearance requirements (documented only)

A future verified parent account may access several explicitly linked children in the same school. Account creation remains optional for both parents and students. Each child's invoices, payments, outstanding balance, payment history and receipts must be calculated separately from authoritative exact-kobo finance records. Parents may access only authorised published academic results/report cards.

Any future legally permitted fee-clearance rule must be configurable, child-specific and academic-period-specific, with the same effective restrictions for equivalent student accounts. One child's debt must never automatically block a sibling. Approved exemptions and administrator overrides must be reasoned and audited. Issuing today's clearance form implements none of these restrictions or decisions. The current student financial-visibility setting and existing published-result rules remain unchanged. No parent login, fee restriction, payment gateway or Milestone 10 portal feature was started.

### Manual browser, print and workflow tests

1. Sign in as School Administrator. Open Forms & Documents, set a school prefix, review the privacy notice and checklist, and preview every generic template. Verify each is clearly untracked and contains no applicant data/reference.
2. Generate a student application for the intended session/class/arm. Check the permanent `APP` reference, original date and school branding. Prepare a print request, inspect every A4 page and use browser Print / Save as PDF. Confirm navigation/buttons are absent, page numbers/reference repeat, handwriting spaces/signature/stamp boxes fit, and no physical-print success is claimed.
3. Reopen and reprint the same application: the reference must not change. Update school prefix/checklist and generate a different form; verify old forms retain their original reference/notice/checklist and new counters did not reset. Cancel an issued non-application document and confirm its number remains reserved.
4. Record a returned form, save an incomplete draft, and reload it. Enter complete student information and additional guardians. Search existing guardians, verify identity/relationship and select the correct record or explicitly confirm a new record. Do not assume that identical phone numbers indicate the same person.
5. Open the private safety panel, record only necessary information with a reason, and verify revision conflicts and teacher/student denials. Print application/safety prefills first without and then with the explicit medical option; check sensitive data appears only when deliberately authorised.
6. Move the application through received, review and approved states with reasons. Try an invalid transition or stale revision. Enrol using the approved class/arm and a valid admission date. Confirm one permanent `STD` number, one registered student, correct guardian links and no login accounts. Retry the same conversion; it must return the same student, while changed retry details must conflict.
7. Use a second application for a sibling and select the same verified guardian. Verify one guardian now links to both children. For a genuinely different adult sharing a phone, explicitly create a distinct verified record and confirm no automatic merge.
8. Verify the new student appears in the correct teacher's current class/arm directory automatically. Search the student and application by original application reference, permanent admission number, student name, parent name/phone and period/status filters. Confirm direct student registration still works and generated admission numbers cannot be edited.
9. Issue authorised prefilled teacher/staff/guardian/administrator/assignment forms and acceptance letters. Confirm employee IDs and teaching/administrative permissions are unchanged. Check transfer/withdrawal/clearance forms do not execute the underlying actions or falsely certify financial clearance.
10. Verify cross-school URLs and teacher/student requests cannot open applications, documents or medical endpoints. Review application/document audit history and cancelled/rejected retained copies. Check keyboard navigation, small-screen previews, long addresses/notices/safety continuation pages, printer scaling, actual A4/PDF pagination and school logo availability. Physical printer/browser checks remain manual.

### Milestones 9B/9C file inventory

Created: `backend/src/models/Admissions.js`, `backend/src/validation/admissions.js`, `backend/src/services/admissionCommon.js`, `backend/src/services/admissions.js`, `backend/src/services/documentTypes.js`, `backend/src/services/documents.js`, `backend/src/routes/admissions.js`, `backend/test/admissions.test.js`, `frontend/src/lib/admissions.js`, `frontend/src/components/MedicalInformation.jsx`, `frontend/src/components/PrintableRegistrationForm.jsx`, `frontend/src/pages/AdmissionApplications.jsx`, `frontend/src/pages/AdmissionApplicationDetail.jsx`, `frontend/src/pages/FormsDocuments.jsx`, `frontend/src/pages/RegistrationFormPreview.jsx`.

Modified for these milestones: `backend/src/models/School.js`, `backend/src/models/Student.js`, `backend/src/services/student.js`, `backend/src/services/guardian.js`, `backend/src/validation/student.js`, `backend/src/routes/students.js`, `backend/src/routes/schoolWorkspace.js`, `backend/src/server.js`, `backend/src/app.js`, `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/components/ConfigurationFields.jsx`, `frontend/src/components/StudentForm.jsx`, `frontend/src/pages/StudentManagement.jsx`, `frontend/src/pages/StudentProfile.jsx`, `frontend/src/styles.css`, and this README. Earlier milestone files remain in the working tree.

### Verification and limitations

`backend/test/admissions.test.js` uses a separate local `MongoMemoryReplSet` with fixed test credentials and a 60-second startup allowance. It never reads the production Atlas connection. It tests all generic types, reference generation/concurrency/uniqueness/immutability, request retries, school numbering, setting changes, partial drafts, workflow/reasons, medical privacy/revisions, atomic rollback/conversion, repeated/concurrent enrolment, guardian matching and sibling links, automatic teacher visibility, original-reference/guardian search, reprint history, safe document prefills, cancellation/history preservation, direct-registration compatibility, role/tenant/CSRF restrictions and suspended-school denial.

Interactive browser and physical-printer verification remain manual; automated A4/PDF results are recorded below. Review output on target browsers/printers, especially unusual fonts, logo sizes or long prefills. References are school scoped, and initial permanent admission numbering skips existing matching manual student IDs; it does not infer or rewrite historical numbering policy. No scanned uploads, full offline synchronization, guardian portal or fee-clearance restrictions are implemented. The existing Vite main-bundle size advisory remains a performance improvement opportunity.

### Milestones 9B/9C final verification - 26 November 2026

- Focused admissions integration suite: `node --test --test-concurrency=1 test/admissions.test.js` from `backend` passed **24/24**, with no skipped or failed tests. Verified application generation/drafts/review/approval/enrolment, explicit guardian verification and sibling links, atomic rollback, concurrent/idempotent enrolment, permanent unique references and cancelled-number retention, reprint history, automatic teacher visibility, medical privacy, roles, tenant isolation, CSRF and suspended-school denial.
- Full backend regression: `npm test` passed **182/182**, with zero failures or skips. Tests used isolated local MongoDB replica sets, not the configured Atlas database. One temporary MongoDB process needed forced termination after its shutdown grace period; the suite still exited successfully.
- Local headless Microsoft Edge rendered the actual printable React component with production CSS and generated **22 synthetic A4 PDFs**: all 11 document types, both blank templates and long prefills. Checked PDF page dimensions (approximately 595 x 842 points), physical-page counts against the component's numbered sheets, sheet bounds, repeated reference/footer text, and hidden navigation/print controls. All 22 cases passed after fixes. The application print layout was also visually inspected under print media. These were component fixtures, not a live authenticated browser walkthrough.
- Confirmed print bugs fixed only in `PrintableRegistrationForm.jsx`: two guardians overflowed one application page; long checklists overflowed the safety page; long child names overflowed guardian tables; clearance review and signatures overflowed one page. Guardians now receive individual application pages; checklists use separate groups of six; guardian child tables use groups of four with separate verification; clearance authorisation has its own page. The blank application now has seven correctly numbered A4 pages. Issued references, data and workflow rules are unchanged.
- Final `npm run lint`, `npm run build` and `git diff --check` passed. Vite's existing bundle-size advisory remains: the main JavaScript chunk is **623.43 kB** before gzip (**175.15 kB** gzipped); this is not a build failure.

Unresolved manual checks: live authenticated UI interaction (including keyboard/mobile behaviour and the browser print dialog), physical printers, other browser engines, externally hosted school-logo availability, and unusual fonts or branding beyond the synthetic fixtures. No new features, dependencies, production-data changes, commits, pushes or deployments were made.

## School-specific branding and local logos - 26 November 2026

School names, logos, addresses, phone numbers and email addresses now come from the selected/authenticated school across administrator, teacher and student workspaces and sign-in pages, registration forms, receipts and report cards. The platform login remains neutral. **Developed by Dev_Bigi** appears only in application footers, which are hidden when printing; printed documents have no developer branding. Browser titles also use the school name.

### Setup and storage

In **School Profile**, save contact/profile edits, then upload a PNG or JPEG logo (maximum **256 KiB**, **1024 × 1024 pixels**). Uploading immediately updates the saved logo and workspace branding. To remove it from future branding, clear the logo URL and save. Existing HTTPS logo URLs remain supported but require internet. No remote URL is fetched by the backend, and no filesystem path or filename is accepted for uploads.

Logos are stored as versioned binary records in the `schoollogos` MongoDB collection and served through the application. With the application and transaction-capable MongoDB running on a local school server, uploaded logos require no internet, cloud storage or image host. An Atlas-backed installation still needs its database connection; this change does not add browser offline caching, a service worker or synchronization. Include **all database collections**, including `schools`, `schoollogos` and issued-document/report-card snapshots, in backup/restore. Local encrypted backup automation and recovery are documented below.

Logo versions are retained when replaced or removed so previously issued documents keep working. Registration forms retain their issued branding snapshots. Newly published report cards snapshot logo/contact details as well as school identity; older report cards retain their academic/name/address snapshots and use current school details only for branding fields absent from the original snapshot. Receipts use the current school header. No academic, financial or admission records are rewritten by this change.

### Sign-in and permissions

School Profile provides `/school-login?school=<schoolId>`, `/teacher-login?school=<schoolId>` and `/student-login?school=<schoolId>` links. School IDs can also be entered on login pages; existing administrator/teacher email-only sign-in remains compatible. When a school ID is supplied, credentials must belong to that school. Logout/session expiry preserves the appropriate school sign-in destination while clearing authenticated branding; switching tenants does not reuse the previous tenant's identity.

- `GET /api/branding/schools/:schoolId` intentionally exposes **only public school identity/contact fields** for active schools, before login. It exposes no users, settings, students, documents or binary data in JSON; there is no public school directory endpoint.
- `GET /api/branding/schools/:schoolId/logos/:logoId` serves a public school-logo image only when the stored logo belongs to that active school. Both IDs are validated; altered school/logo pairs return 404. Responses have fixed image MIME types, `nosniff`, a restrictive CSP and `no-store`.
- `POST /api/school/profile/logo` accepts strict `{ contentType, data }` JSON with base64 image bytes. Only the authenticated school's administrator with completed password setup may upload. Existing CSRF, active-account and school-suspension checks apply. Uploads are rate limited, size/dimension/signature checked; PNG chunks/checksums and bounded decompression are checked. SVG/HTML, MIME spoofing, malformed data and tenant/filename injection are rejected. Saving a local logo URL additionally verifies its school ownership. The larger JSON limit applies only to this upload path; other endpoints retain their 64 KiB limit.

### Verification

- Focused branding/profile/admissions checks passed **44/44**; the final standalone branding run passed **8/8**. Full backend regression passed **190/190**, with zero failures or skips, using isolated local MongoDB replica sets. Coverage includes public-field minimization, school-scoped login, roles, CSRF, malformed/oversized uploads, tenant ownership, suspension and retained image versions.
- Live headless Edge checks used two synthetic schools, a local app/database and blocked external HTTP requests. Verified school login, rejection of another school's credentials, PNG upload, JPEG upload, immediate name/logo refresh, logout to branded login, tenant switching, student/teacher sign-in links and neutral platform login. This also caught and fixed a logout redirect race.
- Generated **15 PDFs from live application routes**: all 11 registration templates plus administrator/student receipts and report cards. Verified school names, local logos loaded from the app, contact details, hidden developer credits and matching registration page counts. The application print layout was visually inspected. No external image service was needed.
- Final `npm run lint` and `npm run build` passed. Vite retains the existing bundle-size advisory: **626.61 kB** main JavaScript before gzip (**176.44 kB** gzipped).

Remaining manual checks: physical printers/browser print dialogs, other browser engines, mobile/keyboard accessibility and unusually long branding/font combinations. No runtime dependencies were added, no production/Atlas records or environment files were changed, and nothing was committed, pushed or deployed.

## Independent Windows local replica set

This is a separate, persistent, single-member replica set for local school development/installation. It supports MongoDB transactions and uses **127.0.0.1:27018**, replica set **schoolLocalRs**, database **dev_bigi_school_local**. MongoDB data and logs stay under this workspace's ignored `.local/mongodb/` directory. Existing MongoDB services, default port 27017 and Atlas environments are left alone.

### Prerequisites and setup

Windows, Node.js **20.19+ or 22.12+**, installed project dependencies, and an installed **MongoDB Server 7+** `mongod.exe` are required. `mongosh` is optional: the scripts use the MongoDB driver already supplied by Mongoose. Missing prerequisites are reported; scripts do not install dependencies, download binaries, register services, change PATH, change execution policy or modify Windows/firewall settings. Run these commands in a normal PowerShell terminal from the project root:

```powershell
.\scripts\windows\Setup-LocalMongo.ps1
# If MongoDB is outside PATH and the usual Program Files location:
# .\scripts\windows\Setup-LocalMongo.ps1 -MongodPath 'D:\MongoDB\bin\mongod.exe'

.\scripts\windows\Start-LocalMongo.ps1
.\scripts\windows\Get-LocalMongoStatus.ps1
.\scripts\windows\Test-LocalMongo.ps1
.\scripts\windows\Stop-LocalMongo.ps1
```

Setup creates `.local/mongodb/mongod.cfg`, an installation manifest, a persistent `data/` directory, **backend/.env.local** with a newly generated private JWT secret, and **frontend/.env.school-local**. Repeating setup preserves existing files and data. Existing `.env`/Atlas configuration is not read by the database manager or overwritten. No administrator credentials are generated or seeded automatically. Do not copy an Atlas URI into the local file: local launchers reject every URI except the exact dedicated loopback connection string.

Startup launches a hidden user process bound only to `127.0.0.1`, initializes its single-member replica set if needed and waits for PRIMARY. Repeated starts/stops are safe. Before initialization, reuse or shutdown, the scripts check the server's actual data directory, bind address, port and replica-set topology; a different instance or changed configuration is refused. Redirected paths outside the workspace and non-empty data directories without an installation manifest are refused. Stop uses MongoDB's graceful shutdown command and retains all files; scripts never force-kill a process or delete a database. Closing the application terminal does not stop the detached database; use Stop-LocalMongo.ps1.

This instance uses loopback-only access without database authentication and is intended for a trusted Windows workstation. It is not configured for LAN sharing or unattended Windows-service startup. A single member provides transactions and durable local storage. Local backup automation is described below; high availability remains separate work.

### Isolated local application commands

Keep the database running, then open separate PowerShell terminals:

```powershell
.\scripts\windows\Start-LocalBackend.ps1       # API: http://localhost:5001
# Optional watched backend: .\scripts\windows\Start-LocalBackend.ps1 -Mode dev
.\scripts\windows\Start-LocalFrontend.ps1      # UI:  http://localhost:5174
```

The backend launcher explicitly selects `backend/.env.local`, overrides inherited database/DNS settings, validates the dedicated URI, and checks the local server's identity before launching. The frontend uses Vite mode `school-local` and the local API on port 5001. Do not use the ordinary `npm run dev` or `npm run seed` commands to select this installation: those retain the project's original environments.

To provision a local Super Admin, first enter your own `SUPER_ADMIN_EMAIL` and a valid `SUPER_ADMIN_PASSWORD` in **backend/.env.local**, then explicitly run:

```powershell
.\scripts\windows\Start-LocalBackend.ps1 -Mode seed
```

No seed was run during verification. Use Ctrl+C to stop the local backend/frontend before stopping MongoDB or running the restart verification. Moving the checkout changes its absolute storage path; the safety manifest/configuration must be deliberately reviewed rather than silently reused. Preserve the entire data directory and all database collections in any backup plan; do not delete `.local` as disposable test output.

### Offline and persistence verification - 26 November 2026

Verified with installed **MongoDB 8.2.6**, Node.js **24.13.1** and the Windows PowerShell wrappers. `mongosh` was not installed and was not needed.

- Setup, repeated setup/start/stop and PRIMARY status checks passed. No Windows service, registry, PATH, firewall or execution-policy changes were made.
- `Test-LocalMongo.ps1` passed offline insert/update/read, transaction commit and deliberate rollback, then graceful shutdown/restart and readback of the committed record **and unique index**. The verification client blocks DNS lookup and every socket outside `127.0.0.1:27018`; Windows network adapters are not disabled.
- Verification writes only a uniquely identified proof record in the local `local_replica_verification` collection and `.local/mongodb/verification.json`. These are retained as persistence evidence. Each run restarts this dedicated instance and restores its initial running/stopped state; stop application users first.
- A fake `mongodb+srv://blocked.invalid/production` value in the local environment was rejected **before connection**, and the original local file was restored. A missing explicit binary produced a prerequisite error without installation/configuration changes. No production Atlas connection was made.
- Local API startup returned `{"status":"ok","database":"connected"}` on port 5001. The separate frontend served on 5174 and resolved its API to 5001. Both temporary application processes were stopped after checking.
- **7/7 focused tests** passed for local URI/environment rejection, network isolation, generated configuration and existing database configuration behaviour. Lint passed. Existing application source and runtime dependencies were unchanged for this setup work.

Final state: local MongoDB stopped cleanly, persistent data retained, generated local environments ignored by Git. No commit, push or deployment was performed.

## Local Backup & Recovery - 26 November 2026

The Super Admin workspace now includes **Backup & Recovery** (`/backups`). It supports downloadable encrypted full application-database snapshots, daily backups, retained history/audits, PDF backup summaries and verified recovery on another Windows computer. Full archives contain every school's accounts and records, so **only Super Admins** may administer them. School Administrators, teachers and students cannot access the archives or their history.

### Enable and create a backup

New Windows local setups include `BACKUPS_ENABLED=true` in **backend/.env.local**. Older local installations must add this setting to that local file; this workspace has been updated. The ordinary environment example defaults it to false. Enabled backup mode refuses SRV/Atlas/remote URIs during configuration validation, before server connection. At runtime the actual MongoDB client, database name, replica-set topology and single loopback member are checked as well. Backup administration also requires a loopback HTTP connection, an active Super Admin session, trusted Origin for mutations and current-password reauthentication for backup creation, inspection, restore and scheduling. Requests are rate limited.

Start the independent local database/backend/frontend using the Windows scripts above, sign in as Super Admin and open Backup & Recovery:

1. Enter your current account password and choose a **recovery passphrase of at least 16 characters, at most 256 UTF-8 bytes**. Keep the exact phrase separately from the encrypted file; the application cannot recover it. Credentials are cleared from the page after each operation and are not stored in browser storage or audit logs.
2. Choose **Create full backup**. The application verifies the completed archive before marking it complete. Download its `.schoolbackup` file and optional **PDF summary** from history. Summaries identify schools, backup date/status, collection counts, encryption method and SHA-256; they contain no recovery phrase, account password or password hash.
3. Keep a downloaded copy on a separate device/drive. Automatic files on the same computer do not protect against loss of that computer. This feature performs no cloud upload and never uses Atlas or an online PDF/encryption service.

Archives are versioned, streaming, gzip-compressed BSON snapshots encrypted with **AES-256-GCM** and a per-file random salt/nonce. Keys use scrypt (`N=32768`, `r=8`, `p=1`, 32 bytes); the format header is authenticated too. No plaintext database dump is written to disk. A snapshot transaction provides one consistent read of the application records, including hidden account password hashes, exact BSON numeric/date/binary types, retained/cancelled/archived records, medical records, audits, numbering reservations, published documents, all stored logo versions and settings. Collection options and indexes are included. Independent collection hashes/counts and the encrypted file's SHA-256 supplement the GCM authentication tag.

Files live in ignored **.local/backups/**. History and audit records live in the active database's `_backupHistory` and `_backupAudit` collections and are included in future snapshots. The interface shows the latest 100 jobs and 200 audit events; older entries remain retained in the database. Missing/off-device archive files do not erase history. Machine environment files/JWT secrets, Windows-protected scheduling keys, MongoDB internal `system.*` collections and earlier backup files themselves are not packed recursively into a database snapshot. Local logo bytes are included; legacy external logo URLs remain references to their external hosts.

### Automatic daily backups

In the same page, re-enter account credentials/recovery phrase, enable daily backups and choose a time. The timezone is **Africa/Lagos**, default **02:00**. The backend checks once per minute and at startup, creates at most one successful daily archive per local calendar date, and catches up after that day's configured time when the backend starts later. **The local backend and MongoDB must be running**. No Windows task/service is silently registered. Graceful backend shutdown waits for an active scheduled backup to finish.

The recovery phrase for automation is encrypted with **Windows DPAPI CurrentUser**, passed to PowerShell through stdin rather than command arguments and saved only as a protected blob. It can be unlocked by the backend's Windows account on that computer; it is not a portable replacement for knowing the recovery phrase. Manual archive files remain portable using that phrase. Database operation leases prevent overlapping manual/daily/recovery jobs; schedule state and last-success dates survive backend restarts. Failures remain visible in audit/history, and successful backups are never overwritten or automatically deleted. Manage disk capacity and separately retained copies according to the school's retention policy.

### Restore on another computer

1. Install/copy the same application and prerequisites, run **Setup-LocalMongo.ps1** and **Start-LocalMongo.ps1**, then provision a local Super Admin with your own bootstrap credentials using **Start-LocalBackend.ps1 -Mode seed**. Use an empty school installation. Start the local backend/frontend and sign in as that bootstrap Super Admin.
2. Upload the encrypted `.schoolbackup` file. Enter the **new computer's current account password** and the **original archive recovery phrase**. Choose **Verify backup and show school identity**. Complete authenticated decryption, inventory/count/checksum validation and school identities are checked before restore writes. Wrong phrases, altered/truncated files and unexpected identities fail closed.
3. Enter every displayed school ID, a recovery reason and the literal **RESTORE**, then re-enter credentials and choose **Create and verify recovery database**. An existing nonempty installation with different school IDs is refused. An empty installation can receive the verified school identities from the archive.
4. The application first creates a complete encrypted **pre-restore backup** of the current installation using the entered recovery phrase. It then restores only into a **new `school_recovery_<24 hex digits>` database**. The current database is never dropped or overwritten. All restored BSON records are reread and hashed, counts/identities are checked, and indexes are recreated. Failure leaves the new target inactive/quarantined and the original installation intact.
5. Successful recovery atomically records its verification proof/audits, revokes restored sessions, clears copied operation locks and disables transferred daily scheduling. Password hashes and other account attributes remain intact; sign in with **passwords valid when the backup was taken**, rather than the new computer's bootstrap credentials.
6. Stop the current backend with Ctrl+C. Leave MongoDB and the frontend running. Use the exact command displayed by the recovery page, for example:

```powershell
.\scripts\windows\Start-RecoveredBackend.ps1 -Database school_recovery_0123456789abcdef01234567
```

The example database name must be replaced with the **actual verified name returned by recovery**. The launcher validates its fixed local connection, this workspace's MongoDB data directory, completed verification proof and school IDs before starting the recovered backend on port 5001. The frontend remains on 5174. It does not rewrite the original local environment; the ordinary Start-LocalBackend.ps1 still selects the original database. Keep one chosen installation active. Reconfigure daily backups for the new Windows account and download a fresh archive after recovery.

`mongodump`, `mongorestore`, `mongosh`, external PDF services and new runtime dependencies are not required. This logical backup format covers the application's ordinary collections; unsupported views, time-series or capped collections cause explicit failure rather than an incomplete successful backup. Archive and expanded-data safety limits are 100 GiB, with bounded record/batch memory; normal MongoDB snapshot transaction duration/storage limits still apply. Interrupted operations never make partial archive files downloadable. Backup/recovery does not add browser offline synchronization, cloud replication or automatic Windows startup.

### Verification results

- Full backend regression passed **210/210**, with zero failures or skips. The final focused backup suite passed **17/17**. Coverage includes permissions/current-password/CSRF checks, no-command rejection of remote/SRV clients, encrypted downloads/PDF summaries, binary/log/account/numeric fidelity, wrong phrases and corrupt files, school mismatch rejection, pre-restore snapshots, overlapping jobs, repeated recovery, persisted daily scheduling, Unicode DPAPI phrases and real Windows-protected scheduled backups with graceful shutdown.
- Actual portable restoration was tested between **two independent local MongoDB servers**, not only between databases on one server. Restored original account hashes, retained records, BSON types and unique indexes were checked.
- On installed **MongoDB 8.2.6**, synthetic drill data was backed up and restored into separate `school_recovery_*` databases. **Start-RecoveredBackend.ps1** started the restored application; health, original account login, retained backup history and disabled transferred schedule passed. The existing `dev_bigi_school_local` business records were not restored over. Drill evidence is retained in **.local/backups/recovery-drill.json** and its encrypted drill archives. A dotenv string-override bug found by this check was fixed and regression tested.
- Live headless Edge with external HTTP requests blocked passed backup creation, archive/PDF downloads, encrypted upload, identity inspection/confirmation, actual recovery and daily-schedule UI execution using Windows-protected secrets. No production Atlas connection was made.
- Lint and the frontend production build passed. Vite's existing bundle advisory remains (**634.98 kB** before gzip, **178.67 kB** gzipped). Physical print/PDF-reader variations and full keyboard/mobile accessibility remain manual checks.

MongoDB and temporary application/browser processes were stopped after verification; persistent local data and encrypted evidence were retained. No Windows system configuration, production environments or Atlas data were changed. Nothing was committed, pushed or deployed.
