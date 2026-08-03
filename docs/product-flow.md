# Vantara IQ / FortitudeOS — end-to-end operating flow

The system Fortitude (a prime / sub-prime underground utility contractor) uses to
run subcontractors, production, billing and pay. Built by underground contractors
for underground contractors (telecom, power, water, gas). This is the product
roadmap; the UI is being built against it, currently on mock data behind the
`data/queries.ts` seam.

Principle throughout: **Claude/AI prepares, Fortitude decides.** Nothing —
quantities, rates, invoices, payments — is ever auto-approved.

---

## 1. Subcontractor onboarding

```
Fortitude sends registration link  (project-specific)
        ↓  Subcontractor creates account
        ↓  Enters company information
        ↓  Uploads W-9, insurance, agreements, payment (ACH) documents
        ↓  Adds capabilities, equipment, crews, contacts
        ↓  Vantara IQ checks onboarding requirements
        ↓  Fortitude reviews and approves account
        ↓  Subcontractor becomes Active
```
Implemented: invite link + email/text forward (`invite-dialog.tsx`), onboarding
landing (`/invite/[token]`, `invite-onboarding.tsx`).

## 2. Project setup

Fortitude creates the project and enters: customer, project number & name, start
date, completion deadline, maps & work orders, project quantity / material list,
**customer rate sheet**, **subcontractor rate sheet**, customer retainage,
subcontractor retainage, payment terms, Fast Pay availability, required daily
documents, supervisors & PMs. Then assigns approved subcontractors and crews.

```
Project created → rates & quantities loaded → managers/supervisors assigned
→ subcontractors assigned → only assigned users receive access
```

## 3. Daily submission

Subcontractor opens their assigned project and creates a daily. The system does
**not** assume a preset production number — they enter what they actually did.
Fields: work date, crew & foreman, map/work-order reference, start & end
locations, unit codes, production quantities, material & reel usage, field notes,
delays/utility conflicts, photos, PDF/image as-built, bore logs & required backup.

```
Daily completed → uploads (PDF/JPEG/PNG/HEIC/logs) → Vantara IQ validates
required fields & documents → submitted → status = Under Review
```

## 4. AI document review

After submission Claude processes uploads: reads handwritten notes, extracts
production quantities, reads daily sheets, compares entered daily to as-built,
checks bore logs, flags missing documents, possible duplicate production,
possible change-order work, material/reel discrepancies, recommends billing codes.

```
Daily + docs → Claude extracts → entered vs. documents compared
→ discrepancies + confidence scores → Fortitude gets a review-ready summary
```
Claude does **not** approve quantities, rates, invoices, or payments.

## 5. Fortitude review & approval

PM/supervisor reviews: approve, adjust individual quantities (with reason), reject
specific items, request corrections, ask for missing docs, or return to the sub.

```
Reviews daily → everything supported?
   No  → correction requested → sub revises & resubmits
   Yes → daily approved
```
Original submitted numbers are preserved in the audit history.

## 6. Production & project tracking

Approved daily updates: approved production, remaining footage, material usage,
crew totals, map progress, billing eligibility, schedule forecast, required daily
production, project health score, dashboard alerts.

## 7. Deadline & production forecasting

`Remaining approved quantity ÷ remaining working days = required daily production.`
Compare to current 7-day average → projected finish and status (Ahead / On /
At risk / Behind), estimated completion date, required additional daily production,
possible crew changes.

## 8. Customer invoice preparation

```
Approved production → customer rate sheet applied → billing rules applied
→ customer retainage → invoice package generated → Fortitude reviews & approves
→ submitted to customer
```
Package: cover sheet, unit/quantity breakdown, approved dailies, as-builts, photos,
bore logs, material reports, project/map summaries. **Separate from sub pay.**

## 9. Subcontractor pay application

Same approved production priced with the **subcontractor** rate sheet.

```
Approved production → sub rates applied → sub retainage → pay application created
→ Fortitude reviews & approves → sub receives approval notice
```
Sub sees only: their project, their approved quantities, their approved payment,
withheld amount (if Fortitude displays it), Fast Pay option, payment status. They
never see customer rates, customer invoices, Fortitude profit, or other subs' data.

## 10. Subcontractor final approval

Sub must review and act: Approve, or Request Review (dispute an item with comment +
files → Fortitude revises/confirms → sub reviews again). On approval: Final
Approval click → acknowledgment recorded (user, date, time, version, IP, device) →
pay application becomes payment-eligible.

## 11. Standard Pay or Fast Pay

When the project allows Fast Pay the sub chooses:
- **Standard Pay** — contract terms, no charge.
- **Fast Pay** — payment within 10 days, 5% charge.

```
Gross approved $25,000 − retainage $2,500 = approved $22,500
Fast Pay fee 5% = $1,125 → final Fast Pay amount $21,375
```
Sub selects option → confirms exact amount → selection recorded & locked →
payment enters accounting queue.

## 12. Payment & status updates

```
Final approval → payment scheduled → processing → completed → portal updates
```
Sub-facing statuses: Approved · Awaiting Final Approval · Scheduled for Payment ·
Processing · Paid.

---

## Complete end-to-end

```
SUB REGISTERS → FORTITUDE APPROVES ACCOUNT → SUB ASSIGNED TO PROJECT
→ SUB SUBMITS DAILY + DOCUMENTS → CLAUDE READS & COMPARES → FORTITUDE REVIEWS
→ CORRECTION OR APPROVAL → APPROVED PRODUCTION UPDATES PROJECT TOTALS
→ REMAINING FOOTAGE & DEADLINES RECALCULATE → CUSTOMER BILLING CALCULATED
→ SUB PAY CALCULATED → FORTITUDE APPROVES PAY APP → SUB FINAL APPROVAL
→ STANDARD OR FAST PAY → PAYMENT PROCESSED → FULL AUDIT HISTORY PRESERVED
```

---

## Rate, unit, material & subcontractor rate-card automation (billing brain)

Internal authorized users upload **GC rate sheets, unit-description sheets, project
material lists, and subcontractor rate cards** (PDF/JPG/PNG/XLS/XLSX/CSV). The AI
**extracts → classifies → drafts**; a human **reviews, edits, approves, activates**.
AI never activates rates, approves pricing, alters signed cards, or finalizes money.

**GC rate sheets** — extract: customer/GC, project, market, state, county, effective &
expiration dates, unit code, unit description, UoM, billing rate, min billable qty, min
charge, billing increment, rate tier, adders, exclusions, billing rules, documentation
requirements, page/source ref, confidence. Rates are scoped by org + customer +
contractor + market + project + effective date. **Never apply a rate to an unrelated
project/market.**

**Unit-description sheets** — extract: unit code, formal description, included labor,
included material, measurement method, docs required, photo/as-built/bore-log/reel
requirements, allowed companion units, exclusions, notes, source page, confidence. Match
to rate-sheet items; flag unmatched/conflicting codes.

**Material lists** — extract: material code, description, manufacturer, size, UoM, planned
qty, reel #, original footage, customer- vs contractor-furnished, project, market, notes,
source page, confidence. Creates draft catalog items + project material budgets; inactive
until approved.

**Subcontractor rate cards** — built from approved project units: sub company, project/
market, version, effective/expiration, unit codes + descriptions + **sub rates**,
retainage, payment terms, Fast Pay (availability/days/fee), special conditions, signature
ack. **Sub must e-sign before rates go active.** Record signer, name, title, timestamp,
IP, user agent, version, document checksum, ack-text version. Signed cards are
**immutable**; edits create a new version; historical production/finalized pay apps keep
the exact rate used.

**Rate separation** — GC rates and sub rates live in separate secured tables/services.
Subs never see GC rates, customer invoice amounts, Fortitude markup/profit, or other subs'
rates.

**Billing automation (on daily approval)** — match unit code → select active GC rate for
work date → select active signed sub rate card for work date → apply deterministic rules →
compute customer billing → compute sub gross → apply customer retainage → apply sub
retainage → store exact applied rates + versions → make eligible for customer invoicing +
sub pay apps.

**Rate-import review screen** — source doc (left) vs extracted rows (right): page, unit
code, description, unit, rate, minimum, rules, confidence, match status, validation
warning; actions: approve / edit / reject / merge duplicate / create new unit / link to
existing. Bulk-approve only rows that pass validation. Permanent audit trail for every
import/edit/approve/activate/supersede/reject.
