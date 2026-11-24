# Shortlist

A frontend-only job recruitment platform. Recruiters filter out applicants who miss the hard requirements, score the rest against weighted criteria, and read short reasoning for every score. Applicants upload a resume once, see roles they are eligible for, apply, and get a specific explanation, tied to a stage, if they are turned down.

There is no backend and no real AI. Everything runs in the browser against mock data stored in `localStorage`, and the "AI" is a set of deterministic functions. This is a learning project.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint
```

Node 20+ is recommended. Use **Continue as demo applicant** or **Continue as demo recruiter** on the landing or login page to skip sign-up. **Reset demo data** (in every footer) restores the seed data and signs you out.

Stack: Next.js (App Router) + TypeScript, Tailwind CSS v4, Zustand (persisted), react-hook-form + zod, lucide-react, Fraunces and Instrument Sans via `next/font/google`.

Rename the product in one place: `lib/config.ts` (`PRODUCT_NAME`).

## Folder structure

```
app/
  (public)/        landing, login, signup, about
  (applicant)/     onboarding, jobs, jobs/[id], apply/[id], applications, applications/[id], profile
  (recruiter)/recruiter/
                   dashboard, jobs, jobs/new, jobs/[id] (applicants), jobs/[id]/edit,
                   jobs/[id]/criteria, candidates/[id], compare
components/
  ui/              toast, modal, menu, field, skeletons/empty/error states, small shared bits
  layout/          public header, footer, signed-in shell (guards the route by role)
  applicant/       resume upload, profile form, tag input
  jobs/            job row, requirements checklist, match breakdown
  applications/    stage timeline
  recruiter/       job form, reject / schedule / hire dialogs
  auth/            login and sign-up form, demo buttons
lib/
  services/        the only layer the UI calls: authService, jobsService, applicationsService,
                   aiService, resumeService, notificationsService (every function is async with a delay)
  ai/              the simulated AI: engine.ts (matching, eligibility, scoring, summaries, feedback),
                   parse.ts (resume parsing), shared.ts (skills, constants)
  store/           Zustand store persisted to localStorage
  mock/            seed data (15 jobs, 6 companies, 60+ applicants, applications at every stage)
  hooks/           useAsync (runs a service call, refreshes after any write), useSession
  utils/           formatting helpers
types/index.ts     shared types: Job, Applicant, Resume, Application, Stage, Criterion, Score, Feedback, Interview, Notification
```

Rule of thumb: components never import mock data or the store. They call a service through `useAsync`, and services read and write the store through `mutate()`.

## How the simulated AI works

All of it is in `lib/ai/engine.ts`. The same inputs always give the same output, so nothing changes between renders. Every AI result in the UI carries an **AI-generated** label and the criteria it was based on.

| Function | What it does |
| --- | --- |
| `checkEligibility` | Pass or fail for five hard requirements: minimum experience, required skills, location (or remote), notice period, degree. Each result has a reason. |
| `matchJob` / `matchJobs` | Match percentage = skills 50% (required 65 / preferred 35) + experience fit 20% + location 15% + salary fit 15%. Returns a "why this matches" list, a "what's missing" list and a one-line reason. |
| `scoreApplication` | Scores each recruiter criterion from 0 to 100 and combines them by weight. Criterion kinds: skills, experience, education, stability (average tenure), domain (past roles in the same field), communication (cover note length, specificity, figures) and custom (keyword search). Every score has two or three sentences citing resume details. |
| `summarizeApplication` | Three or four lines: strengths, concerns, pay and notice, suggested next step. |
| `generateRejectionFeedback` | Names the stage, gives two to four reasons taken from failed requirements and the lowest criteria, and two or three things to improve. Written to the applicant. Recruiters can edit it before sending. |
| `suggestCriteria` | A starting set of weighted criteria for a role's category. |
| `parseResume` (`parse.ts`) | Reads TXT files and matches keywords (skills, years, degree, city, email). PDF and DOCX cannot be decoded in a browser-only demo, so those fall back to a believable sample profile chosen by hashing the file name. The UI says which happened, and every field is editable. |

Overrides: a recruiter can override any single criterion score (a comment is required). Moving a candidate against the AI's suggestion, such as shortlisting someone who fails a hard requirement, is recorded automatically as a decision override. Both show in the candidate's override log.

## Connecting a real backend and a real LLM later

1. **Data.** Replace the bodies of the functions in `lib/services/jobsService.ts`, `applicationsService.ts`, `resumeService.ts`, `authService.ts` and `notificationsService.ts` with `fetch` calls. Keep the signatures and return shapes; no component needs to change. Delete `lib/store/` and `lib/mock/` once nothing reads them. `useAsync` currently re-runs after any store write (`tick`); with a server, call its `reload()` after mutations, or move to React Query or SWR.
2. **Auth.** `authService` fakes a session. Swap it for your provider and keep `getCurrentUser()`. The route guard lives in `components/layout/app-shell.tsx`; for production, enforce roles on the server as well (middleware or route handlers).
3. **AI.** Replace the bodies in `lib/services/aiService.ts` with calls to your LLM API, ideally through your own server so keys stay private. Ask for structured JSON matching `Score`, `Feedback`, `Eligibility` and `JobMatch` in `types/index.ts`. Keep `lib/ai/engine.ts` as a rules-based fallback or as a test oracle. Keep the **AI-generated** labels and the "based on" lines, and keep the override flow, since people need to be able to correct the model.
4. **Resumes.** Real PDF and DOCX parsing needs a server (or a library such as pdf.js and mammoth in the browser). Replace `readFileText` in `lib/ai/parse.ts`.
5. **Files to touch, in order:** `lib/services/*` → `lib/hooks/useSession.ts` → `components/layout/app-shell.tsx` → remove `lib/store`, `lib/mock`.

## Design rules

One background (`#F4F1EA`), one text colour (`#1C1B18`) and one accent (`#9A5B3F`), defined as CSS variables in `app/globals.css`. Every other colour is a tint mixed from those three. Status is shown with icon shapes, weight and text, not extra colours. Layout leans on hairline rules, tables and lists instead of cards.
