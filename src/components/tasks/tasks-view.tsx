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
  Trash2,
  TriangleAlert,
  User,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
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
  const [filter, setFilter] = React.useState<"OPEN" | "ALL" | "MINE">("OPEN");

  const live = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");
  const shown =
    filter === "ALL" ? tasks : filter === "MINE" ? live : live;

  const overdue = live.filter((t) => t.overdue).length;
  const blocked = live.filter((t) => t.status === "BLOCKED").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open" value={live.length} hint="not finished" />
        <Stat label="Overdue" value={overdue} hint={overdue ? "past the date" : "none late"} tone={overdue ? "text-critical" : undefined} />
        <Stat label="Blocked" value={blocked} hint={blocked ? "waiting on something" : "nothing stuck"} tone={blocked ? "text-warning" : undefined} />
        <Stat label="Done" value={tasks.filter((t) => t.status === "DONE").length} hint="closed out" />
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
          <div className="flex rounded-lg border border-border p-0.5">
            {(["OPEN", "ALL"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "focus-ring rounded-md px-2 py-1 text-[11.5px] font-medium transition",
                  filter === f ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f === "OPEN" ? `Open ${live.length}` : `All ${tasks.length}`}
              </button>
            ))}
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-brand-bright"
            >
              <Plus className="size-3.5" /> New task
            </button>
          ) : null}
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
                : "Nothing open. Switch to All to see what's been closed."}
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

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-foreground/[0.02] px-3 py-2.5">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 text-[19px] font-semibold tracking-[-0.02em] text-foreground", tone)}>
        {value}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One task.
 * ------------------------------------------------------------------ */

type Detail = Awaited<ReturnType<typeof getTaskDetail>>;

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
      <div className="flex flex-wrap items-start gap-2">
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
                {t.overdue ? " · overdue" : ""}
              </span>
            ) : null}
            {t.completedAt ? (
              <span className="text-success">done {t.completedAt} by {t.completedBy}</span>
            ) : null}
          </span>
        </button>

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

  const problem = detail?.photos.filter((p) => p.kind === "PROBLEM") ?? [];
  const fixed = detail?.photos.filter((p) => p.kind === "RESOLUTION") ?? [];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <PhotoGroup
        title="The problem"
        note="What was found"
        tone="warning"
        photos={problem}
        busy={busy === "PROBLEM"}
        onPick={() => problemRef.current?.click()}
        onDelete={async (id) => { await deleteTaskPhoto(id); onChanged(); }}
      />
      <PhotoGroup
        title="What was done"
        note="Proof it's fixed"
        tone="success"
        photos={fixed}
        busy={busy === "RESOLUTION"}
        onPick={() => fixRef.current?.click()}
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
}: {
  title: string;
  note: string;
  tone: "warning" | "success";
  photos: NonNullable<Detail>["photos"];
  busy: boolean;
  onPick: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-2.5",
      tone === "warning" ? "border-warning/25 bg-warning/[0.02]" : "border-success/25 bg-success/[0.02]",
    )}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={cn("text-[11.5px] font-semibold", tone === "warning" ? "text-warning" : "text-success")}>
          {title}
        </span>
        <span className="text-[10.5px] text-muted-foreground">· {note}</span>
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className="focus-ring ml-auto inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-foreground hover:bg-foreground/[0.05] disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" />}
          Photo
        </button>
      </div>

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={onPick}
          className="focus-ring flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border px-2 py-5 text-center hover:border-brand/40"
        >
          <Camera className="size-4 text-muted-foreground" />
          <span className="text-[10.5px] text-muted-foreground">Nothing yet</span>
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-lg border border-border/70">
              <a href={p.url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || title} className="aspect-[4/3] w-full object-cover" />
              </a>
              <div className="px-1.5 py-1">
                <p className="num text-[9.5px] text-muted-foreground">{p.createdAt}</p>
                {p.lat != null && p.lng != null ? (
                  <p className="num flex items-center gap-0.5 text-[9px] text-muted-foreground/80">
                    <MapPin className="size-2" /> {formatCoords(p.lat, p.lng)}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  className="focus-ring mt-0.5 text-[9.5px] text-muted-foreground hover:text-critical"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
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
