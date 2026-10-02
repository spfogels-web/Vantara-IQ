# Cleanup backlog

Small, known, deliberately deferred. Each entry says what is wrong, why it was
not fixed at the time, and what "done" means — so picking one up does not start
with an archaeology session.

---

## 1. The status bar reports weather nobody measured

**Where:** `src/components/dashboard/status-bar.tsx`

```tsx
<CloudSun className="size-3.5 text-warning" />
72°F · clear · Greenville, SC
```

**What is wrong:** the temperature, the conditions and the city are written into
the file. They are not read from anything. The footer renders them beside
figures that *are* real — a live sync time, a real safety streak — which is what
makes them convincing rather than obviously decorative.

This is the same category of defect as the `145 days incident free` that sat two
elements to the right of it until the incident module replaced it, and it was
found at the same time. It was left alone deliberately: the safety claim was in
scope for that change and the weather was not, and mixing them would have put an
unreviewed third-party integration inside a commit about damage reports.

**Why it matters more than it looks:** Greenville, SC is not where every crew is.
The three markets are separate, and a crew in another state reading "72°F ·
clear" on the company dashboard is being told something false about their own
day. A dashboard that is wrong about the weather invites the question of what
else on it is decorative.

**Done means** one of:

- **Real data.** A weather lookup keyed to the viewer's market — not a fixed
  city — with the reading's own timestamp shown, and an explicit stale/
  unavailable state when the lookup fails. Needs a provider decision and a key
  in the environment, which is why it is not a five-minute change.
- **An honest neutral state.** Remove the element, or show the market name
  without a reading. Cheap, correct, and better than what is there now.

Either is acceptable. What is not acceptable is leaving a number on the screen
that nobody measured.

**Not blocking anything.** No other work depends on this.
