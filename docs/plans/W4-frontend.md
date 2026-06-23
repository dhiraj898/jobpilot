# W4: Frontend UX Polish

## Files touched (only these — do not edit others)
- web/src/pages/Dashboard.tsx
- web/src/pages/Applications.tsx

## Gate
`cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/web && npm run build`

---

## Task 1 — Add `saved` status everywhere
**File:** `web/src/pages/Applications.tsx`

**Step A — STATUSES array** (around line 7):
```typescript
const STATUSES = ['all', 'applied', 'interview', 'offer', 'rejected']
```
Change to:
```typescript
const STATUSES = ['all', 'saved', 'applied', 'interview', 'offer', 'rejected']
```

**Step B — STATUS_BADGE** (if it exists, find the badge/color mapping object): Add an entry for `'saved'`. Use a neutral color like gray or blue. For example:
```typescript
saved: 'bg-gray-100 text-gray-700',
```

**Step C — Status dropdown in the add/edit form**: Find the `<select>` or `<option>` elements for status. Add:
```html
<option value="saved">Saved</option>
```
Place it as the first option after any empty/placeholder option.

**Step D — Applications.tsx filter**: The filter bar likely has status filter buttons or a dropdown. Ensure `saved` appears there (it will automatically if STATUSES drives it, but verify).

---

## Task 2 — Fix Applications load() infinite spinner
**File:** `web/src/pages/Applications.tsx`

Find the `load()` function (around line 23). It currently has `.then()` but no `.catch()`. Add:

```typescript
const load = () => {
  setLoading(true)
  api.get('/applications')
    .then(r => {
      setApps(r.data.data || [])
      setLoading(false)
    })
    .catch(err => {
      setError(err.message || 'Failed to load applications')
      setLoading(false)
    })
}
```

Also add an `error` state and display it:
```typescript
const [error, setError] = useState<string | null>(null)
```

In the JSX, show the error if present:
```tsx
{error && (
  <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
    {error}
  </div>
)}
```

---

## Task 3 — Fix Dashboard silent API failures
**File:** `web/src/pages/Dashboard.tsx`

Find both fetch calls that currently use `.catch(() => {})`. Replace each with error-state handling:

```typescript
const [error, setError] = useState<string | null>(null)

// In useEffect or load function:
api.get('/applications')
  .then(r => setApps(r.data.data || []))
  .catch(err => setError(err.message || 'Failed to load dashboard data'))

api.get('/profile')
  .then(r => setProfile(r.data.data))
  .catch(err => setError(err.message || 'Failed to load profile'))
```

Show a banner at the top of the Dashboard when error is set:
```tsx
{error && (
  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm">
    {error} — try refreshing the page.
  </div>
)}
```

---

## Task 4 — Add `saved` stage to Dashboard pipeline funnel
**File:** `web/src/pages/Dashboard.tsx`

Find the pipeline/funnel component. It likely has an array like:
```typescript
const stages = ['Applied', 'Interview', 'Offer', 'Rejected']
```
Or individual hardcoded counts. Add 'Saved' as the first stage:
```typescript
const stages = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected']
```
And calculate its count from `apps.filter(a => a.status === 'saved').length`.

---

## Task 5 — Render Notes field
**File:** `web/src/pages/Applications.tsx`

The `Application` interface has a `notes` field that is fetched but never shown. Add notes to the application row or as an expandable section.

Simplest approach — add a notes column to the table, or show notes below each row if non-empty:

```tsx
{app.notes && (
  <p className="text-xs text-gray-500 mt-1 italic">{app.notes}</p>
)}
```

If the form for adding/editing applications exists, add a notes textarea:
```tsx
<textarea
  placeholder="Notes (optional)"
  value={form.notes || ''}
  onChange={e => setForm({ ...form, notes: e.target.value })}
  className="w-full border rounded p-2 text-sm"
  rows={2}
/>
```

---

## Task 6 — Add delete confirmation
**File:** `web/src/pages/Applications.tsx`

Find the delete button handler. Change from immediate delete:
```typescript
onClick={() => api.delete(`/applications/${app.id}`).then(load)}
```
To:
```typescript
onClick={() => {
  if (!window.confirm(`Delete application for ${app.company}? This cannot be undone.`)) return
  api.delete(`/applications/${app.id}`).then(load)
}}
```

---

## Task 7 — Fix Dashboard "View All" hard reload
**File:** `web/src/pages/Dashboard.tsx`

Find:
```tsx
<a href="/applications">View All</a>
```
Or similar. Replace with React Router navigation. The `useNavigate` hook should already be available from react-router-dom. If not imported, add it:

```typescript
import { useNavigate } from 'react-router-dom'
// inside component:
const navigate = useNavigate()
```

Then:
```tsx
<button onClick={() => navigate('/applications')} className="text-sm text-blue-600 hover:underline">
  View All
</button>
```

Or use `<Link to="/applications">View All</Link>` if the Link component is already imported.

---

## Task 8 — Add "Configure AI key" to onboarding checklist
**File:** `web/src/pages/Dashboard.tsx`

Find the onboarding checklist (likely an array of steps or a hardcoded list). Add an item:

```typescript
{ label: 'Configure AI key', done: !!profile?.sarvamApiKey, link: '/settings' }
```

Or if the checklist is hardcoded JSX, add:
```tsx
<li className={`flex items-center gap-2 ${profile?.sarvamApiKey ? 'text-green-600' : 'text-gray-700'}`}>
  {profile?.sarvamApiKey ? '✓' : '○'} Configure AI key
  {!profile?.sarvamApiKey && (
    <button onClick={() => navigate('/settings')} className="text-xs text-blue-600 underline ml-1">
      Go to Settings
    </button>
  )}
</li>
```

The field name for the API key in profile may be `sarvamApiKey` or `apiKey` — check the Profile type to confirm the exact field name.

---

## Verify
```bash
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/web && npm run build
```
Must exit 0 with no TypeScript errors.
