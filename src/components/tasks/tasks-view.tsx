"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload as blobUpload } from "@vercel/blob/client";
import {
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  User,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { MessageButton } from "@/components/messages/message-button";
import { TaskCommunication } from "@/components/messages/task-communication";
import { formatCoords } from "@/lib/exif";
import type { TaskRow } from "@/data/queries";
import {
  addTaskComment,
  addTaskPhoto,
  createTask,
  deleteTask,
  deleteTaskPhoto,
  getTaskDetail,
  setTaskStatus,
} from "@/app/actions";
import { Panel, PanelBody, PanelHeader } from "@/components/common/panel";

/**
 * Work assigned to a person or a crew.
 *
 * A task carries what needs doing, who it is on, and a photograph of the thing
 * itself — a cracked pedestal explained in a sentence is an argument; a picture
 * of it is not. Closing one with a photo of the fix beside the photo of the
 * fault leaves a record that settles the question months later.
 *
 * Staff assign and close; a crew sees only what is on them, and can move it
 * along, add photos and talk on the thread — but never delete it.
 */

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  OPEN: { label: "Open", cls: "bg-foreground/[0.06] text-muted-foreground", dot: "bg-muted-foreground" },
  IN_PROGRESS: { label: "In progress", cls: "bg-info/12 text-info", dot: "bg-info" },
  BLOCKED: { label: "Blocked", cls: "bg-critical/12 text-critical", dot: "bg-critical" },
  DONE: { label: "Done", cls: "bg-success/12 text-success", dot: "bg-success" },
  CANCELLED: { label: "Cancelled", cls: "bg-foreground/[0.06] text-muted-foreground line-through", dot: "bg-muted-foreground" },
};

const PRIORITY: Record<string, { label: string; cls: string }> = {
  LOW: { label: "Low", cls: "text-muted-foreground" },
  NORMAL: { label: "Normal", cls: "text-muted-foreground" },
  HIGH: { label: "High", cls: "text-warning" },
  URGENT: { label: "Urgent", cls: "text-critical font-semibold" },
};

type Assignees = {
  employees: { id: string; name: string }[];
  crews: { id: string; company: string }[];
  projects: { id: string; name: string }[];
};

export function TasksView({
  tasks,
  assignees,
  canManage,
}: {
  tasks: TaskRow[];
  /** Empty for a crew — they are never choosing who a task goes to. */
  assignees: Assignees | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("OPEN");
  const [priority, setPriority] = React.useState("ALL");
  const [project, setProject] = React.useState("ALL");
  const [assignee, setAssignee] = React.useState("ALL");

  const live = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");

  /** The five figures worth knowing before reading a single row. */
  const counts = {
    open: live.length,
    dueToday: live.filter((t) => t.dueToday).length,
    overdue: live.filter((t) => t.overdue).length,
    high: live.filter((t) => t.priority === "HIGH" || t.priority === "URGENT").length,
    blocked: live.filter((t) => t.status === "BLOCKED").length,
  };

  /** Only offer a filter value something actually has. */
  const projects = React.useMemo(
    () => [...new Set(tasks.map((t) => t.projectName).filter(Boolean))].sort(),
    [tasks],
  );
  const people = React.useMemo(
    () => [...new Set(tasks.map((t) => t.assigneeName).filter(Boolean))].sort(),
    [tasks],
  );

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = tasks.filter((t) => {
      const isLive = t.status !== "DONE" && t.status !== "CANCELLED";
      if (status === "OPEN" && !isLive) return false;
      if (status === "OVERDUE" && !t.overdue) return false;
      if (status === "DUE_TODAY" && !t.dueToday) return false;
      if (status === "BLOCKED" && t.status !== "BLOCKED") return false;
      if (status === "DONE" && t.status !== "DONE") return false;
      if (priority !== "ALL" && t.priority !== priority) return false;
      if (project !== "ALL" && t.projectName !== project) return false;
      if (assignee !== "ALL" && t.assigneeName !== assignee) return false;
      if (q && ![t.title, t.detail, t.assigneeName, t.projectName, t.category]
        .join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    // Worst first: how late it is, then priority, then the date itself. The
    // office opens this screen to find what is on fire, not to read a diary.
    const rank = (t: TaskRow) =>
      (t.overdue ? 0 : t.dueToday ? 1 : t.dueDate ? 2 : 3) * 100 -
      (t.priority === "URGENT" ? 20 : t.priority === "HIGH" ? 10 : 0);
    return [...kept].sort(
      (a, b) => rank(a) - rank(b) || b.overdueDays - a.overdueDays || (a.dueDate || "9").localeCompare(b.dueDate || "9"),
    );
  }, [tasks, query, status, priority, project, assignee]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Chip label="Open" value={counts.open} hint="not finished" active={status === "OPEN"} onClick={() => setStatus("OPEN")} />
        <Chip label="Due today" value={counts.dueToday} hint="on the date" tone="warning" active={status === "DUE_TODAY"} onClick={() => setStatus("DUE_TODAY")} />
        <Chip label="Overdue" value={counts.overdue} hint="past the date" tone="critical" active={status === "OVERDUE"} onClick={() => setStatus("OVERDUE")} />
        <Chip label="High" value={counts.high} hint="high or urgent" tone="warning" active={priority === "HIGH"} onClick={() => setPriority(priority === "HIGH" ? "ALL" : "HIGH")} />
        <Chip label="Blocked" value={counts.blocked} hint="waiting on something" tone="critical" active={status === "BLOCKED"} onClick={() => setStatus("BLOCKED")} />
      </div>

      <Panel>
        <PanelHeader
          title="Tasks"
          description={
            canManage
              ? "Assign work to an employee or a crew, with a photo of what needs doing"
              : "Work assigned to your crew"
          }
          count={shown.length}
          icon={<ClipboardList className="size-3.5" />}
        >
          {/* Six controls, which is three too many for a phone in one row.

              They are one group rather than six siblings: on a phone the
              group takes the whole width and wraps inside itself, and from
              sm up it sits inline exactly as it did. Loose in the header they
              were each free to push the next one along, and New task — last
              in the row and the only thing on this page somebody came here to
              press — went off the edge in both orientations. */}
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
            {canManage ? (
              // First on a phone, last on a desktop. The primary action should
              // not be something you scroll or hunt for on the device where
              // most tasks actually get raised — standing on a job, one hand.
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="focus-ring order-first inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-bright sm:order-last sm:h-8 sm:px-2.5 sm:text-[12px]"
              >
                <Plus className="size-4 sm:size-3.5" /> New task
              </button>
            ) : null}

            <label className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks…"
                aria-label="Search tasks"
                className="focus-ring h-8 w-full min-w-0 rounded-lg bg-foreground/[0.05] pl-7 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/70 sm:w-[170px]"
              />
            </label>
            <Picker value={status} onChange={setStatus} label="Status" options={[
              ["OPEN", `Open ${counts.open}`], ["DUE_TODAY", "Due today"], ["OVERDUE", "Overdue"],
              ["BLOCKED", "Blocked"], ["DONE", "Done"], ["ALL", `All ${tasks.length}`],
            ]} />
            <Picker value={priority} onChange={setPriority} label="Priority" options={[
              ["ALL", "Any priority"], ["URGENT", "Urgent"], ["HIGH", "High"], ["NORMAL", "Normal"], ["LOW", "Low"],
            ]} />
            {projects.length > 1 ? (
              <Picker value={project} onChange={setProject} label="Project"
                options={[["ALL", "Any project"], ...projects.map((p) => [p, p] as [string, string])]} />
            ) : null}
            {people.length > 1 ? (
              <Picker value={assignee} onChange={setAssignee} label="Assignee"
                options={[["ALL", "Anyone"], ...people.map((p) => [p, p] as [string, string])]} />
            ) : null}
          </div>
        </PanelHeader>

        {adding && assignees ? (
          <NewTaskForm
            assignees={assignees}
            onCancel={() => setAdding(false)}
            onCreated={() => {
              setAdding(false);
              router.refresh();
            }}
          />
        ) : null}

        {shown.length === 0 ? (
          <PanelBody className="py-10 text-center">
            <ClipboardList className="mx-auto size-6 text-muted-foreground/40" />
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {tasks.length === 0
                ? canManage
                  ? "Nothing assigned yet. A task can be anything that needs chasing — a COI, a damaged ped, a truck that needs moving."
                  : "Nothing assigned to your crew."
                : "Nothing matches these filters."}
            </p>
          </PanelBody>
        ) : (
          <ul className="divide-y divide-border/40">
            {shown.map((t) => (
              <TaskRowItem key={t.id} task={t} canManage={canManage} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/**
 * One of the five figures across the top — and the filter for it.
 *
 * A count that tells you four tasks are overdue and then makes you go and find
 * them is half a feature. Pressing it shows exactly those four.
 */
function Chip({
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "warning" | "critical";
  active?: boolean;
  onClick: () => void;
}) {
  const hot = value > 0 && tone;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-ring rounded-xl border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-brand/60 bg-brand/[0.1]"
          : "border-border/70 bg-foreground/[0.02] hover:border-brand/40",
      )}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "num mt-0.5 text-[21px] font-bold tracking-[-0.02em]",
          hot === "critical" ? "text-critical" : hot === "warning" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </button>
  );
}

function Picker({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: [string, string][];
}) {
  const on = value !== "ALL" && value !== "OPEN";
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "focus-ring h-8 max-w-[150px] cursor-pointer rounded-lg px-2 text-[12px] font-medium outline-none transition-colors",
        on ? "bg-brand text-white" : "bg-foreground/[0.05] text-foreground",
      )}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ *
 * One task.
 * ------------------------------------------------------------------ */

type Detail = Awaited<ReturnType<typeof getTaskDetail>>;

/** What a category is called in front of a person. */
const CATEGORY: Record<string, string> = {
  COMPLIANCE: "Compliance",
  FIELD_ISSUE: "Field issue",
  MATERIALS: "Materials",
  SAFETY: "Safety",
  ADMIN: "Admin",
  GENERAL: "General",
};

function RowAction({
  label,
  onClick,
  tone,
  busy,
}: {
  label: string;
  onClick: () => void;
  tone?: "success" | "warning";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        // The whole row is a toggle; an action inside it must not also open it.
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "focus-ring inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[11.5px] font-medium transition-colors disabled:opacity-40",
        tone === "success"
          ? "border-success/40 text-success hover:bg-success/[0.1]"
          : tone === "warning"
            ? "border-warning/40 text-warning hover:bg-warning/[0.1]"
            : "border-border text-foreground hover:bg-foreground/[0.05]",
      )}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : null}
      {label}
    </button>
  );
}

function TaskRowItem({ task: t, canManage }: { task: TaskRow; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<Detail>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [noteFor, setNoteFor] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");

  const st = STATUS[t.status] ?? STATUS.OPEN;
  const pr = PRIORITY[t.priority] ?? PRIORITY.NORMAL;

  const load = React.useCallback(async () => {
    const d = await getTaskDetail(t.id);
    setDetail(d);
  }, [t.id]);

  React.useEffect(() => {
    if (open && !detail) void load();
  }, [open, detail, load]);

  async function move(status: string, withNote = "") {
    setBusy(status);
    setError(null);
    const res = await setTaskStatus(t.id, status, withNote);
    setBusy(null);
    if (res.ok) {
      setNoteFor(null);
      setNote("");
      setDetail(null);
      router.refresh();
      if (open) void load();
    } else setError(res.error);
  }

  return (
    <li className={cn("p-3", t.overdue && "bg-critical/[0.02]")}>
      {/* Lateness and kind, before the title.
          "Overdue" told you a task was past its date; it did not tell you
          whether that was yesterday or a month ago, and those are different
          jobs. The category says whether this is paperwork or a hole in the
          ground without having to read the sentence. */}
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        {t.overdue ? (
          <span className="inline-flex items-center gap-1.5 rounded bg-critical/15 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-critical">
            <TriangleAlert className="size-3" />
            Overdue {t.overdueDays} {t.overdueDays === 1 ? "day" : "days"}
          </span>
        ) : t.dueToday ? (
          <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-warning">
            Due today
          </span>
        ) : null}
        <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
          {CATEGORY[t.category] ?? t.category}
        </span>
      </div>

      <div className="flex items-start gap-3">
        {/* The photograph, in the list. Recognising a task by the thing itself
            is faster than reading a title, and it is the reason the photo was
            taken. */}
        {t.previewUrl ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="focus-ring group/thumb relative size-14 shrink-0 overflow-hidden rounded-xl border border-border/70"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={t.previewUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover transition duration-300 group-hover/thumb:scale-110"
            />
            {t.photoCount > 1 ? (
              <span className="num absolute bottom-0 right-0 rounded-tl-md bg-black/70 px-1 text-[9px] font-semibold text-white">
                {t.photoCount}
              </span>
            ) : null}
            {t.hasResolution ? (
              <span className="absolute left-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-success text-white">
                <Check className="size-2.5" />
              </span>
            ) : null}
          </button>
        ) : (
          <span
            className={cn(
              "grid size-14 shrink-0 place-items-center rounded-xl border border-dashed",
              t.overdue ? "border-critical/30" : "border-border/60",
            )}
          >
            <Camera className="size-4 text-muted-foreground/40" />
          </span>
        )}

        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", st.dot)} />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="focus-ring min-w-0 flex-1 rounded text-left"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-[13.5px] font-medium text-foreground",
                (t.status === "DONE" || t.status === "CANCELLED") && "text-muted-foreground line-through",
              )}
            >
              {t.title}
            </span>
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", st.cls)}>
              {st.label}
            </span>
            {t.priority !== "NORMAL" ? (
              <span className={cn("text-[10.5px] uppercase tracking-wider", pr.cls)}>{pr.label}</span>
            ) : null}
          </span>

          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {t.assigneeKind === "crew" ? <Users className="size-3" /> : <User className="size-3" />}
              {t.assigneeName}
            </span>
            {t.projectName ? <span>{t.projectName}</span> : null}
            {t.dueDate ? (
              <span className={cn("num", t.overdue && "font-medium text-critical")}>
                due {t.dueDate}
              </span>
            ) : null}
            {t.completedAt ? (
              <span className="text-success">done {t.completedAt} by {t.completedBy}</span>
            ) : null}
          </span>

          {/* What evidence is on it, without opening it.
              The two photo kinds answer different questions — "is there a
              picture of what is wrong" and "is there a picture proving it was
              fixed" — and a single count answered neither. */}
          <span className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
            <span
              className={cn(
                "inline-flex items-center gap-1",
                t.problemPhotos > 0 ? "text-foreground/80" : "text-muted-foreground/60",
              )}
            >
              <Camera className="size-3" /> Issue {t.problemPhotos}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1",
                t.resolutionPhotos > 0 ? "text-success" : "text-muted-foreground/60",
              )}
            >
              <Camera className="size-3" /> Resolution {t.resolutionPhotos}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1",
                t.commentCount > 0 ? "text-foreground/80" : "text-muted-foreground/60",
              )}
            >
              <MessageSquare className="size-3" /> {t.commentCount}
            </span>
          </span>
        </button>

        {/* The three moves that get made ninety times out of a hundred, on the
            row. Opening a task to press Start is a click spent on nothing. */}
        {canManage && t.status !== "DONE" && t.status !== "CANCELLED" ? (
          <span className="hidden shrink-0 items-center gap-1.5 lg:flex">
            {t.status === "OPEN" ? (
              <RowAction label="Start" onClick={() => void move("IN_PROGRESS")} busy={busy === "IN_PROGRESS"} />
            ) : null}
            {t.status !== "BLOCKED" ? (
              <RowAction
                label="Blocked"
                tone="warning"
                onClick={() => {
                  setOpen(true);
                  setNoteFor("BLOCKED");
                }}
              />
            ) : null}
            <RowAction label="Complete" tone="success" onClick={() => void move("DONE")} busy={busy === "DONE"} />
            {/* Straight into the thread for whoever this task is on. The
                conversation is picked from the assignment rather than chosen,
                and it stays linked to the task afterwards. */}
            <MessageButton taskId={t.id} label="Message" />
          </span>
        ) : null}

        <ChevronDown
          className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition", open && "rotate-180")}
        />
      </div>

      {t.detail && !open ? (
        <p className="mt-1 line-clamp-2 pl-4 text-[12px] text-muted-foreground">{t.detail}</p>
      ) : null}
      {t.status === "BLOCKED" && t.statusNote ? (
        <p className="mt-1.5 flex items-start gap-1.5 pl-4 text-[11.5px] text-critical">
          <TriangleAlert className="mt-px size-3 shrink-0" /> {t.statusNote}
        </p>
      ) : null}
      {error ? <p className="mt-1.5 pl-4 text-[11.5px] text-critical">{error}</p> : null}

      {open ? (
        <div className="mt-3 flex flex-col gap-3 pl-4">
          {t.detail ? (
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">
              {t.detail}
            </p>
          ) : null}

          {/* Move it along. A crew can do this too — it is their work. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {t.status !== "IN_PROGRESS" && t.status !== "DONE" ? (
              <MoveButton busy={busy === "IN_PROGRESS"} onClick={() => void move("IN_PROGRESS")}>
                Start
              </MoveButton>
            ) : null}
            {t.status !== "DONE" ? (
              <MoveButton busy={busy === "DONE"} tone="success" onClick={() => void move("DONE")}>
                <Check className="size-3" /> Mark done
              </MoveButton>
            ) : (
              <MoveButton busy={busy === "OPEN"} onClick={() => void move("OPEN")}>
                Reopen
              </MoveButton>
            )}
            {t.status !== "BLOCKED" && t.status !== "DONE" ? (
              <MoveButton busy={false} tone="warning" onClick={() => { setNoteFor("BLOCKED"); setNote(""); }}>
                Blocked
              </MoveButton>
            ) : null}
            {canManage && t.status !== "CANCELLED" ? (
              <MoveButton busy={false} onClick={() => { setNoteFor("CANCELLED"); setNote(""); }}>
                Cancel
              </MoveButton>
            ) : null}
            {canManage ? (
              <button
                type="button"
                onClick={() => void deleteTask(t.id).then(() => router.refresh())}
                title="Delete this task"
                className="focus-ring ml-auto grid size-7 place-items-center rounded border border-border/70 text-muted-foreground hover:border-critical/40 hover:text-critical"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>

          {/* Blocked and cancelled both need a reason before they take. */}
          {noteFor ? (
            <div className="flex items-center gap-1.5">
              <input
                value={note}
                autoFocus
                onChange={(e) => setNote(e.target.value)}
                placeholder={noteFor === "BLOCKED" ? "What's it waiting on?" : "Why cancel it?"}
                className="flex-1 rounded-lg border border-border/70 bg-foreground/[0.03] px-2.5 py-1.5 text-[12.5px] text-foreground outline-none focus:border-brand/60"
              />
              <button
                type="button"
                disabled={!note.trim()}
                onClick={() => void move(noteFor, note)}
                className="focus-ring grid size-8 place-items-center rounded-lg bg-brand text-white disabled:opacity-40"
              >
                <Check className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setNoteFor(null)}
                className="focus-ring grid size-8 place-items-center rounded-lg border border-border text-muted-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          <TaskPhotos taskId={t.id} detail={detail} onChanged={() => { setDetail(null); void load(); }} />
          {/* What has actually been sent to the crew about this, and a way
              into the thread. Distinct from the internal note thread below:
              one is us talking to ourselves, the other is us talking to them. */}
          <TaskCommunication taskId={t.id} comms={detail?.comms ?? null} />

          <TaskThread taskId={t.id} detail={detail} onChanged={() => { setDetail(null); void load(); }} />
        </div>
      ) : null}
    </li>
  );
}

function MoveButton({
  children,
  busy,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  busy: boolean;
  tone?: "success" | "warning";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "focus-ring inline-flex h-7 items-center gap-1 rounded border px-2 text-[11.5px] font-medium transition disabled:opacity-40",
        tone === "success"
          ? "border-success/40 text-success hover:bg-success/10"
          : tone === "warning"
            ? "border-warning/40 text-warning hover:bg-warning/10"
            : "border-border text-foreground hover:bg-foreground/[0.05]",
      )}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Photos: the problem, and what was done about it.
 * ------------------------------------------------------------------ */

function TaskPhotos({
  taskId,
  detail,
  onChanged,
}: {
  taskId: string;
  detail: Detail;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [viewing, setViewing] = React.useState<number | null>(null);
  const problemRef = React.useRef<HTMLInputElement>(null);
  const fixRef = React.useRef<HTMLInputElement>(null);

  async function send(file: File, kind: "PROBLEM" | "RESOLUTION") {
    setBusy(kind);
    setError(null);

    // Same rule as the project gallery: a position is recorded only when the
    // device actually gives one, and never blocks the upload.
    let lat: number | null = null;
    let lng: number | null = null;
    if (navigator.geolocation) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        navigator.geolocation.getCurrentPosition(
          (p) => { lat = p.coords.latitude; lng = p.coords.longitude; done(); },
          () => done(),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
        );
        window.setTimeout(done, 8500);
      });
    }

    try {
      const blob = await blobUpload(`task-photos/${taskId}/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      const res = await addTaskPhoto({
        taskId,
        url: blob.url,
        mediaType: file.type || "",
        sizeBytes: file.size,
        kind,
        lat,
        lng,
        locationSource: lat !== null ? "device" : "",
      });
      setBusy(null);
      if (res.ok) onChanged();
      else setError(res.error);
    } catch {
      setBusy(null);
      setError("Upload failed — check Blob storage is connected for this environment.");
    }
  }

  const all = detail?.photos ?? [];
  const problem = all.filter((p) => p.kind === "PROBLEM");
  const fixed = all.filter((p) => p.kind === "RESOLUTION");
  // The viewer walks the whole set, not one group, so the fault and the fix are
  // one arrow key apart.
  const indexOf = (id: string) => all.findIndex((p) => p.id === id);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <PhotoGroup
        title="The problem"
        note="What was found"
        tone="warning"
        photos={problem}
        busy={busy === "PROBLEM"}
        onPick={() => problemRef.current?.click()}
        onOpen={(i) => setViewing(indexOf(problem[i].id))}
        onDelete={async (id) => { await deleteTaskPhoto(id); onChanged(); }}
      />
      <PhotoGroup
        title="What was done"
        note="Proof it's fixed"
        tone="success"
        photos={fixed}
        busy={busy === "RESOLUTION"}
        onPick={() => fixRef.current?.click()}
        onOpen={(i) => setViewing(indexOf(fixed[i].id))}
        onDelete={async (id) => { await deleteTaskPhoto(id); onChanged(); }}
      />

      <input
        ref={problemRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f, "PROBLEM"); }}
      />
      <input
        ref={fixRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f, "RESOLUTION"); }}
      />

      {error ? <p className="text-[11.5px] text-critical lg:col-span-2">{error}</p> : null}

      {viewing !== null && all[viewing] ? (
        <PhotoLightbox
          photos={all}
          index={viewing}
          onClose={() => setViewing(null)}
          onMove={setViewing}
        />
      ) : null}
    </div>
  );
}

function PhotoGroup({
  title,
  note,
  tone,
  photos,
  busy,
  onPick,
  onDelete,
  onOpen,
}: {
  title: string;
  note: string;
  tone: "warning" | "success";
  photos: NonNullable<Detail>["photos"];
  busy: boolean;
  onPick: () => void;
  onDelete: (id: string) => void;
  onOpen: (index: number) => void;
}) {
  const amber = tone === "warning";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border",
        amber
          ? "border-warning/25 bg-gradient-to-b from-warning/[0.07] to-transparent"
          : "border-success/25 bg-gradient-to-b from-success/[0.07] to-transparent",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg",
            amber ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
          )}
        >
          {amber ? <TriangleAlert className="size-3.5" /> : <Check className="size-3.5" />}
        </span>
        <div className="min-w-0">
          <p className={cn("text-[12.5px] font-semibold", amber ? "text-warning" : "text-success")}>
            {title}
          </p>
          <p className="text-[10.5px] text-muted-foreground">{note}</p>
        </div>
        <span className="num ml-auto text-[11px] text-muted-foreground">
          {photos.length ? `${photos.length}` : ""}
        </span>
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className={cn(
            "focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-semibold transition disabled:opacity-40",
            amber
              ? "bg-warning text-black hover:opacity-90"
              : "bg-success text-white hover:opacity-90",
          )}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          {photos.length ? "Add" : "Photo"}
        </button>
      </div>

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={onPick}
          className="group/empty flex w-full flex-col items-center gap-2 px-3 pb-5 pt-2 text-center"
        >
          <span
            className={cn(
              "grid h-28 w-full place-items-center rounded-xl border border-dashed transition",
              amber
                ? "border-warning/30 group-hover/empty:border-warning/60 group-hover/empty:bg-warning/[0.04]"
                : "border-success/30 group-hover/empty:border-success/60 group-hover/empty:bg-success/[0.04]",
            )}
          >
            <Camera className="size-6 text-muted-foreground/60 transition group-hover/empty:text-muted-foreground" />
          </span>
          <span className="text-[11px] text-muted-foreground">
            {amber ? "Show what you found" : "Show it's sorted"}
          </span>
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
          {photos.map((p, i) => (
            <li key={p.id} className="group/ph relative overflow-hidden rounded-xl border border-border/60">
              <button type="button" onClick={() => onOpen(i)} className="focus-ring block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption || title}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition duration-300 group-hover/ph:scale-[1.04]"
                />
                {/* The stamp sits on the image rather than under it — the point
                    of a job-site photo is where and when, and a caption line
                    below pushes the grid taller for information nobody reads. */}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-5 text-left">
                  <span className="num block text-[9.5px] font-medium text-white/90">
                    {p.createdAt}
                  </span>
                  {p.lat != null && p.lng != null ? (
                    <span className="num flex items-center gap-0.5 text-[8.5px] text-white/70">
                      <MapPin className="size-2" /> {formatCoords(p.lat, p.lng)}
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(p.id)}
                title="Remove"
                className="focus-ring absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-lg bg-black/55 text-white/80 opacity-0 backdrop-blur-sm transition hover:bg-critical hover:text-white group-hover/ph:opacity-100"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Full-size viewer.
 *
 * A thumbnail is enough to know a photo exists and not enough to judge what it
 * shows — which is the entire reason the photo was taken. Arrow keys move
 * through the set, because comparing the fault against the fix means going back
 * and forth between them.
 */
function PhotoLightbox({
  photos,
  index,
  onClose,
  onMove,
}: {
  photos: NonNullable<Detail>["photos"];
  index: number;
  onClose: () => void;
  onMove: (next: number) => void;
}) {
  const photo = photos[index];

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onMove((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onMove((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onMove]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10.5px] font-semibold",
            photo.kind === "PROBLEM" ? "bg-warning/20 text-warning" : "bg-success/20 text-success",
          )}
        >
          {photo.kind === "PROBLEM" ? "The problem" : "What was done"}
        </span>
        <span className="num text-[11.5px] text-white/70">{photo.createdAt}</span>
        {photo.lat != null && photo.lng != null ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${photo.lat},${photo.lng}`}
            target="_blank"
            rel="noreferrer"
            className="focus-ring num inline-flex items-center gap-1 rounded text-[11.5px] text-white/70 hover:text-white"
          >
            <MapPin className="size-3" /> {formatCoords(photo.lat, photo.lng)}
          </a>
        ) : null}
        <span className="ml-auto text-[11.5px] text-white/50">
          {index + 1} of {photos.length}
          {photo.uploadedBy ? ` · ${photo.uploadedBy}` : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring grid size-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption || photo.kind}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-xl object-contain"
        />
      </div>

      {photos.length > 1 ? (
        <div className="flex items-center justify-center gap-2 pb-4" onClick={(e) => e.stopPropagation()}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onMove(i)}
              className={cn(
                "size-1.5 rounded-full transition",
                i === index ? "w-5 bg-white" : "bg-white/35 hover:bg-white/60",
              )}
              aria-label={`Photo ${i + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * The thread.
 * ------------------------------------------------------------------ */

function TaskThread({
  taskId,
  detail,
  onChanged,
}: {
  taskId: string;
  detail: Detail;
  onChanged: () => void;
}) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    const res = await addTaskComment(taskId, body);
    setBusy(false);
    if (res.ok) {
      setBody("");
      onChanged();
    }
  }

  const comments = detail?.comments ?? [];

  return (
    <div className="rounded-xl border border-border/60 p-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <MessageSquare className="size-3" /> Thread
        {comments.length ? <span className="font-normal">· {comments.length}</span> : null}
      </p>

      {comments.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground">
          Nothing yet. Anything said here stays with the task.
        </p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1.5">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn(
                "text-[12px]",
                // Status changes read as history, not conversation.
                c.systemNote ? "text-muted-foreground" : "text-foreground",
              )}
            >
              <span className="font-medium">{c.authorName}</span>{" "}
              {c.systemNote ? <span className="italic">{c.body}</span> : c.body}
              <span className="num ml-1.5 text-[10px] text-muted-foreground/70">{c.createdAt}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
          placeholder="Add a note…"
          className="flex-1 rounded-lg border border-border/70 bg-foreground/[0.03] px-2.5 py-1.5 text-[12.5px] text-foreground outline-none focus:border-brand/60"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !body.trim()}
          className="focus-ring grid size-8 place-items-center rounded-lg bg-brand text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * New task.
 * ------------------------------------------------------------------ */

function NewTaskForm({
  assignees,
  onCancel,
  onCreated,
}: {
  assignees: Assignees;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [detail, setDetail] = React.useState("");
  const [priority, setPriority] = React.useState("NORMAL");
  const [category, setCategory] = React.useState("GENERAL");
  const [dueDate, setDueDate] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  // One control, two kinds of assignee — "u:<id>" or "c:<id>" — because a task
  // goes to a person or a crew and choosing both is not a state that exists.
  const [assignee, setAssignee] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await createTask({
      title,
      detail,
      priority,
      category,
      dueDate,
      projectId: projectId || null,
      assigneeUserId: assignee.startsWith("u:") ? assignee.slice(2) : null,
      assigneeSubId: assignee.startsWith("c:") ? assignee.slice(2) : null,
    });
    setBusy(false);
    if (res.ok) onCreated();
    else setError(res.error);
  }

  const field =
    "rounded-lg border border-border/70 bg-foreground/[0.03] px-2.5 py-2 text-[12.5px] text-foreground outline-none focus:border-brand/60";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-b border-border/70 bg-foreground/[0.015] p-3">
      <input
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        className={cn(field, "text-[13.5px] font-medium")}
      />
      <textarea
        value={detail}
        rows={2}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="Any detail — where it is, what it looks like, what good looks like."
        className={cn(field, "resize-y")}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Assign to</span>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={cn(field, "appearance-none")}>
            <option value="">Nobody yet</option>
            <optgroup label="Employees">
              {assignees.employees.map((e) => (
                <option key={e.id} value={`u:${e.id}`}>{e.name}</option>
              ))}
            </optgroup>
            <optgroup label="Subcontractors">
              {assignees.crews.map((c) => (
                <option key={c.id} value={`c:${c.id}`}>{c.company}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Project</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={cn(field, "appearance-none")}>
            <option value="">None</option>
            {assignees.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name.trim()}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {/* What kind of thing this is — the label somebody scans the list by
              before they read a single title. */}
          <span className="text-[11px] font-medium text-muted-foreground">Kind</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={cn(field, "appearance-none")}>
            <option value="GENERAL">General</option>
            <option value="COMPLIANCE">Compliance</option>
            <option value="FIELD_ISSUE">Field issue</option>
            <option value="MATERIALS">Materials</option>
            <option value="SAFETY">Safety</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={cn(field, "appearance-none")}>
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Due</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={cn(field, "num")} />
        </label>
      </div>

      {error ? <p className="text-[11.5px] text-critical">{error}</p> : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-bright disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring inline-flex h-9 items-center rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <span className="text-[11px] text-muted-foreground">
          Photos go on once it exists — open the task and add them.
        </span>
      </div>
    </form>
  );
}
