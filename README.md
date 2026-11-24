# Dev_Bigi School Management System

Milestones 1–6: project foundation, Super Admin workspace, School Administrator accounts, school profile, academic structure, teachers/staff, students/admissions, parents/guardians, attendance, and school fees/finance. React/Vite (JavaScript), Tailwind CSS, Lucide React, Axios, Express, MongoDB/Mongoose, bcrypt, and JWT cookies.

Milestone 7 adds examinations, assigned-teacher score entry, result approval/publication and printable report cards. Existing modules and their data remain available.

## Run locally

Requires Node.js 20.19+ or 22.12+ and MongoDB Atlas or a MongoDB replica set. Milestone 3 uses transactions; a standalone local `mongod` is not sufficient for configuration writes. Your existing Atlas connection and DNS configuration work unchanged.

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

1. **School Profile** (`/school/profile`): review or edit the school name, address, city, country, phone, email, type and logo URL. A logo must be an HTTPS image URL without embedded credentials; file uploads and image hosting are not implemented. Platform status and ownership fields cannot be changed. `/school/settings` redirects here.
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

Before broader commercial deployment, plan backups, monitoring, an external rate-limit store when running multiple API processes, password recovery/MFA and audit logging. Those are outside this milestone. No deployment is performed by this project setup.

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
5. Change a saved status to correct it. Supply a correction reason (3�300 characters) and confirm. Each real change appends a separate audit record with previous/new status, revision, administrator ID/name, timestamp and reason. The original creator and creation time remain unchanged. Saving an unchanged status at the current revision is a no-op and creates no extra audit event.
6. **View audit** displays a paginated history of the initial mark and every correction, including actor and time. Revision checks reject stale browsers, repeat creates and competing corrections with 409; reload before attempting another correction. Bulk writes are atomic: any invalid/ineligible/cross-school entry aborts the complete batch and its audit writes.

Each `(schoolId, kind, personId, date)` has at most one attendance record, enforced by a unique index. Student uniqueness is across classes/arms/sessions on that date; moving the student cannot create a second daily mark. Each person's first saved mark snapshots their name/identifier and academic placement or staff category, so later profile edits do not rewrite reports. All writes share the school configuration transaction lock to prevent races with student/staff/academic edits.

Attendance days use **Africa/Lagos (WAT)**, stored as UTC-midnight calendar dates. Future dates are rejected in roster requests, writes and report anchors/ranges. No holiday calendar, timetable, school-day schedule or automatic absence generation is introduced. Dates before the person's admission/employment cannot receive new marks.

### Historical records and eligibility

Inactive/archived students and inactive staff cannot receive new attendance or corrections. Their existing records remain reportable and visible as read-only in their original registers. Previously saved student records may be corrected by an authorised administrator if the student is still active, even after a placement transfer or academic session/class/arm deactivation; the original saved placement is immutable. Such corrections must use the original register and current revision. New attendance still requires a current eligible placement and active academic context. Removing a class arm referenced by attendance is blocked; deactivate it instead. Attendance/audit records have no permanent-delete or audit-edit endpoint.

Expected daily roster counts use the current eligible roster for that date plus retained recorded people in that register, so a later transfer/deactivation cannot hide an existing mark. They are **not frozen historical enrolment snapshots** for unmarked people. Historical percentages and summaries use recorded observations, rather than inventing expected school days for prior weeks/months. Attendance snapshots do not constitute a complete student transfer/enrolment-history module.

### Reports, histories and percentages

Open `/school/attendance/reports`:

- Choose students or staff and a daily, weekly, monthly or custom range. Weeks run Monday�Sunday. Month/week ends are clipped to today if the selected period is ongoing; custom ranges must be ordered, end no later than today and span at most 367 inclusive days.
- Filter by academic session/class/arm for students or teaching/non-teaching category for staff, plus status and name/identifier search. A class filter is required for an arm filter. Inactive academic references remain available for historical reports. All reference IDs are checked against the school.
- **Choose individual** uses the existing paginated directory to select a student or staff member, including inactive/archived people, and opens their filtered attendance history. **Clear individual** returns to a group report. Staff category and person-name snapshots reflect the saved attendance record, not subsequent profile edits.
- Summary cards, a daily breakdown and paginated records use real matching database records. Summary calculations cover the complete filtered result, independently of the current record page. Days without records are omitted rather than fabricated as zero/absent days. Audit history is available from each saved record.

Percentage = **100 � (Present + Late) / (Present + Late + Absent)**, rounded to two decimal places. Excused observations and unmarked people/days are excluded from the denominator; Late counts as attendance. A zero denominator displays **�**, not a fabricated 0% or 100%. Status/search/person/placement filters apply to both records and calculated summaries, so a filtered report describes those observations only.

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

`kind` is `student` or `staff`; status values are lowercase `present`, `absent`, `late`, `excused`. All mutation requests retain the existing Origin/cookie protections. Unknown input/query fields are rejected. Attendance paging defaults to 25 and is capped at 50. A bulk write accepts 1�100 unique people (the UI saves one visible page):

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

Method IDs may be `cash`, `bank_transfer`, `pos`, `other`, or an active own-school custom method ID. Invoice entries use `kind` (`discount`, `scholarship`, `adjustment`), decimal-string `amount`, `reason` (3�300 characters), current invoice `revision`, and a stable `requestKey`. Reversals use `{ "reason": "Recorded against the wrong account" }`. Reusing a retry key with different financial details returns 409; identical payment/entry retries return the existing result without reposting.

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
