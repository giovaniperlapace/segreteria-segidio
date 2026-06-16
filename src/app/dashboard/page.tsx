import { BrandLogo } from "@/app/brand-logo";
import { requireProfile } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

type DashboardEvent = {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  status: "draft" | "active" | "concluded" | "archived";
  total_count: number;
  selected_count: number;
  invited_count: number;
  no_response_count: number;
  attending_count: number;
  declined_count: number;
  maybe_count: number;
  pending_proposal_count: number;
};

type EventResponseCounts = {
  total_count: number;
  selected_count: number;
  invited_count: number;
  no_response_count: number;
  attending_count: number;
  declined_count: number;
  maybe_count: number;
};

type ProposalPreview = {
  id: number;
  event_id: number;
  event_title: string;
  event_starts_at: string;
  contact_name: string;
  contact_detail: string;
};

type ReferenceSummary = {
  referenceName: string | null;
  assignedActiveCount: number;
  assignedStandbyCount: number;
  assignedMissingCount: number;
  pendingProposalCount: number;
  upcomingProposals: ProposalPreview[];
};

type IconName =
  | "archive"
  | "attention"
  | "calendar"
  | "check"
  | "clock"
  | "history"
  | "settings"
  | "users";

type NavigationItem = {
  title: string;
  description: string;
  href: string;
  icon: IconName;
};

const managerCards: NavigationItem[] = [
  {
    title: "Contatti",
    description: "Gestione completa dell'archivio e dei dati mancanti.",
    href: "/dashboard/contacts",
    icon: "archive",
  },
  {
    title: "Referenti",
    description: "Profili interni e assegnazioni dei contatti.",
    href: "/dashboard/references",
    icon: "users",
  },
  {
    title: "Eventi",
    description: "Creazione eventi, liste invitati e risposte.",
    href: "/dashboard/events",
    icon: "calendar",
  },
  {
    title: "Storico",
    description: "Audit modifiche e versioni contatto consultabili.",
    href: "/dashboard/audit",
    icon: "history",
  },
  {
    title: "Settings",
    description: "Lingue, gruppi e impostazioni operative riutilizzabili.",
    href: "/dashboard/settings",
    icon: "settings",
  },
];

const referenceCards: NavigationItem[] = [
  {
    title: "I miei contatti",
    description: "Visualizza e aggiorna i contatti assegnati al tuo profilo.",
    href: "/dashboard/contacts",
    icon: "archive",
  },
  {
    title: "Proposte di invito",
    description: "Approva o escludi le proposte di invito assegnate.",
    href: "/dashboard/proposals",
    icon: "attention",
  },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eventStatusLabel(status: DashboardEvent["status"]) {
  const labels: Record<DashboardEvent["status"], string> = {
    draft: "Bozza",
    active: "Attivo",
    concluded: "Concluso",
    archived: "Archiviato",
  };
  return labels[status];
}

function contactName(contact: {
  first_name?: string | null;
  last_name?: string | null;
  institution?: string | null;
}) {
  return (
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.institution ||
    "Contatto senza nome"
  );
}

function DashboardIcon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.9,
    viewBox: "0 0 24 24",
  };

  if (name === "archive") {
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M4 7.5h16" />
        <path d="M6 7.5v11h12v-11" />
        <path d="M8 4.5h8l2 3H6l2-3Z" />
        <path d="M10 12h4" />
      </svg>
    );
  }

  if (name === "attention") {
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M12 4.5 21 19H3l9-14.5Z" />
        <path d="M12 9v4" />
        <path d="M12 16.5h.01" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M7 3.5v3" />
        <path d="M17 3.5v3" />
        <path d="M4.5 9h15" />
        <path d="M5.5 5.5h13v14h-13z" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }

  if (name === "clock") {
    return (
      <svg aria-hidden="true" {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    );
  }

  if (name === "history") {
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M5 7v5h5" />
        <path d="M5.7 12a6.5 6.5 0 1 0 2-4.7L5 10" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
        <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.7a8 8 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a8 8 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" {...common}>
      <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M16.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M3.5 20a5 5 0 0 1 10 0" />
      <path d="M13.5 19.5a4 4 0 0 1 7 0" />
    </svg>
  );
}

async function countMissingContacts(contactIds: number[]) {
  if (contactIds.length === 0) return 0;

  const supabase = createSupabaseServiceClient();
  const chunkSize = 400;
  let total = 0;

  for (let index = 0; index < contactIds.length; index += chunkSize) {
    const chunk = contactIds.slice(index, index + chunkSize);
    const { count, error } = await supabase
      .from("contacts_missing_required_data")
      .select("id", { count: "exact", head: true })
      .in("id", chunk);

    if (error) throw error;
    total += count ?? 0;
  }

  return total;
}

async function loadManagerDashboard() {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const [
    activeContacts,
    standbyContacts,
    missingContacts,
    activeEvents,
    upcomingEvents,
    pendingProposals,
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "standby"),
    supabase
      .from("contacts_missing_required_data")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("events")
      .select("id,title,starts_at,ends_at,location,status")
      .in("status", ["draft", "active"])
      .order("starts_at", { ascending: true })
      .limit(8),
    supabase
      .from("events")
      .select("id,title,starts_at,ends_at,location,status")
      .gte("starts_at", now)
      .neq("status", "archived")
      .order("starts_at", { ascending: true })
      .limit(8),
    supabase
      .from("invitation_proposals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  for (const result of [
    activeContacts,
    standbyContacts,
    missingContacts,
    activeEvents,
    upcomingEvents,
    pendingProposals,
  ]) {
    if (result.error) throw result.error;
  }

  const eventsById = new Map<
    number,
    Omit<
      DashboardEvent,
      | "total_count"
      | "selected_count"
      | "invited_count"
      | "no_response_count"
      | "attending_count"
      | "declined_count"
      | "maybe_count"
      | "pending_proposal_count"
    >
  >();
  for (const event of [...(activeEvents.data ?? []), ...(upcomingEvents.data ?? [])]) {
    eventsById.set(Number(event.id), {
      id: Number(event.id),
      title: event.title,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      location: event.location,
      status: event.status,
    });
  }

  const eventIds = [...eventsById.keys()];
  const [responseCounts, proposalRows] = await Promise.all([
    Promise.all(
      eventIds.map(async (eventId) => {
        const { data, error } = await supabase
          .rpc("event_invitation_response_counts", { p_event_id: eventId })
          .maybeSingle();
        if (error) throw error;
        return { eventId, data: data as EventResponseCounts | null };
      }),
    ),
    eventIds.length > 0
      ? supabase
          .from("invitation_proposals")
          .select("event_id")
          .eq("status", "pending")
          .in("event_id", eventIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (proposalRows.error) throw proposalRows.error;

  const pendingProposalCountByEvent = new Map<number, number>();
  for (const proposal of proposalRows.data ?? []) {
    const eventId = Number(proposal.event_id);
    pendingProposalCountByEvent.set(eventId, (pendingProposalCountByEvent.get(eventId) ?? 0) + 1);
  }

  const responseCountByEvent = new Map(responseCounts.map((item) => [item.eventId, item.data]));
  const events = [...eventsById.values()]
    .map((event) => {
      const counts = responseCountByEvent.get(event.id);
      return {
        ...event,
        total_count: Number(counts?.total_count ?? 0),
        selected_count: Number(counts?.selected_count ?? 0),
        invited_count: Number(counts?.invited_count ?? 0),
        no_response_count: Number(counts?.no_response_count ?? 0),
        attending_count: Number(counts?.attending_count ?? 0),
        declined_count: Number(counts?.declined_count ?? 0),
        maybe_count: Number(counts?.maybe_count ?? 0),
        pending_proposal_count: pendingProposalCountByEvent.get(event.id) ?? 0,
      };
    })
    .sort((first, second) => {
      if (first.status === "active" && second.status !== "active") return -1;
      if (second.status === "active" && first.status !== "active") return 1;
      return new Date(first.starts_at).getTime() - new Date(second.starts_at).getTime();
    })
    .slice(0, 6);

  return {
    activeContacts: activeContacts.count ?? 0,
    standbyContacts: standbyContacts.count ?? 0,
    missingContacts: missingContacts.count ?? 0,
    pendingProposals: pendingProposals.count ?? 0,
    events,
  };
}

async function loadReferenceDashboard(profileId: string): Promise<ReferenceSummary> {
  const supabase = createSupabaseServiceClient();

  const { data: reference, error: referenceError } = await supabase
    .from("internal_references")
    .select("id,full_name")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (referenceError) throw referenceError;
  if (!reference) {
    return {
      referenceName: null,
      assignedActiveCount: 0,
      assignedStandbyCount: 0,
      assignedMissingCount: 0,
      pendingProposalCount: 0,
      upcomingProposals: [],
    };
  }

  const referenceId = Number(reference.id);
  const [activeContacts, standbyContacts, assignedContacts, pendingProposals, proposalPreview] =
    await Promise.all([
      supabase
        .from("contact_references")
        .select("contact_id,contacts!inner(id)", { count: "exact", head: true })
        .eq("reference_id", referenceId)
        .is("contacts.deleted_at", null)
        .eq("contacts.status", "active"),
      supabase
        .from("contact_references")
        .select("contact_id,contacts!inner(id)", { count: "exact", head: true })
        .eq("reference_id", referenceId)
        .is("contacts.deleted_at", null)
        .eq("contacts.status", "standby"),
      supabase
        .from("contact_references")
        .select("contact_id,contacts!inner(id,status,deleted_at)")
        .eq("reference_id", referenceId)
        .is("contacts.deleted_at", null)
        .limit(10000),
      supabase
        .from("invitation_proposals")
        .select("id", { count: "exact", head: true })
        .eq("reference_id", referenceId)
        .eq("status", "pending"),
      supabase
        .from("invitation_proposals")
        .select(
          "id,event_id,events!inner(title,starts_at),contacts!inner(first_name,last_name,institution,institutional_role,email)",
        )
        .eq("reference_id", referenceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  for (const result of [activeContacts, standbyContacts, assignedContacts, pendingProposals, proposalPreview]) {
    if (result.error) throw result.error;
  }

  const assignedContactIds = [
    ...new Set((assignedContacts.data ?? []).map((row) => Number(row.contact_id))),
  ];
  const assignedMissingCount = await countMissingContacts(assignedContactIds);

  const upcomingProposals = (proposalPreview.data ?? []).map((proposal) => {
    const event = Array.isArray(proposal.events) ? proposal.events[0] : proposal.events;
    const contact = Array.isArray(proposal.contacts) ? proposal.contacts[0] : proposal.contacts;
    return {
      id: Number(proposal.id),
      event_id: Number(proposal.event_id),
      event_title: event?.title ?? "Evento",
      event_starts_at: event?.starts_at ?? new Date().toISOString(),
      contact_name: contactName(contact ?? {}),
      contact_detail: [contact?.institutional_role, contact?.institution, contact?.email]
        .filter(Boolean)
        .join(" · "),
    };
  });

  return {
    referenceName: reference.full_name,
    assignedActiveCount: activeContacts.count ?? 0,
    assignedStandbyCount: standbyContacts.count ?? 0,
    assignedMissingCount,
    pendingProposalCount: pendingProposals.count ?? 0,
    upcomingProposals,
  };
}

function MetricCard({
  title,
  value,
  detail,
  href,
  icon,
  tone = "default",
}: {
  title: string;
  value: number;
  detail: string;
  href?: string;
  icon: IconName;
  tone?: "default" | "attention" | "good";
}) {
  const toneClasses = {
    default: {
      card: "border-[#d9e1f2] bg-white",
      icon: "bg-[#eef3ff] text-[#1b3272]",
      value: "text-[#1b3272]",
      accent: "bg-[#1b3272]",
    },
    attention: {
      card: "border-[#f0c2bd] bg-[#fffafa]",
      icon: "bg-[#fff0ef] text-[#a12d24]",
      value: "text-[#a12d24]",
      accent: "bg-[#d43c2f]",
    },
    good: {
      card: "border-[#cde8d2] bg-[#fbfffc]",
      icon: "bg-[#eaf8ed] text-[#226435]",
      value: "text-[#226435]",
      accent: "bg-[#2c7a3f]",
    },
  }[tone];

  const content = (
    <>
      <span className={`absolute inset-x-0 top-0 h-1 ${toneClasses.accent}`} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
          <p className={`mt-3 text-3xl font-semibold leading-none ${toneClasses.value}`}>
            {formatNumber(value)}
          </p>
        </div>
        <span className={`rounded-xl p-2.5 ${toneClasses.icon}`}>
          <DashboardIcon name={icon} />
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{detail}</p>
    </>
  );

  const className = `relative overflow-hidden rounded-2xl border p-5 shadow-sm transition ${toneClasses.card}`;

  return href ? (
    <Link href={href} className={`${className} block hover:-translate-y-0.5 hover:shadow-md`}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}

function EventCount({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "attention" | "good";
}) {
  const toneClass = {
    default: "bg-slate-50 text-[#1b3272]",
    attention: "bg-[#fff0ef] text-[#a12d24]",
    good: "bg-[#eaf8ed] text-[#226435]",
  }[tone];

  return (
    <div className={`rounded-xl px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-70">{label}</p>
      <p className="mt-1 text-base font-semibold leading-none">{formatNumber(value)}</p>
    </div>
  );
}

function ManagerDashboard({
  summary,
}: {
  summary: Awaited<ReturnType<typeof loadManagerDashboard>>;
}) {
  return (
    <>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Contatti attivi"
          value={summary.activeContacts}
          detail="Archivio operativo disponibile per nuove liste."
          href="/dashboard/contacts?status=active"
          icon="check"
          tone="good"
        />
        <MetricCard
          title="Dati mancanti"
          value={summary.missingContacts}
          detail="Schede da completare prima di inviti e stampe."
          href="/dashboard/contacts?missing=yes"
          icon="attention"
          tone={summary.missingContacts > 0 ? "attention" : "default"}
        />
        <MetricCard
          title="Non attivi"
          value={summary.standbyContacts}
          detail="Contatti conservati nello storico ma fuori operatività."
          href="/dashboard/contacts?status=standby"
          icon="archive"
        />
        <MetricCard
          title="Proposte pendenti"
          value={summary.pendingProposals}
          detail="Indicazioni dei referenti ancora da chiudere."
          href="/dashboard/events"
          icon="clock"
          tone={summary.pendingProposals > 0 ? "attention" : "default"}
        />
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-[#fbfcff] px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-[#1b3272]">Eventi da seguire</h2>
            <p className="mt-1 text-sm text-slate-600">
              Eventi in bozza, attivi o futuri con conteggi allineati alla lista inviti.
            </p>
          </div>
          <Link
            href="/dashboard/events?status=open"
            className="rounded-xl border border-[#d43c2f]/30 px-3 py-2 text-sm font-semibold text-[#d43c2f] hover:bg-[#fff0ef]"
          >
            Apri eventi
          </Link>
        </div>

        {summary.events.length > 0 ? (
          <div className="divide-y divide-slate-200">
            {summary.events.map((event) => (
              <article key={event.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(220px,1fr)_2fr_auto] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-[#eef3ff] p-1.5 text-[#1b3272]">
                      <DashboardIcon name="calendar" className="h-4 w-4" />
                    </span>
                    <h3 className="truncate text-sm font-semibold text-[#1b3272]">{event.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                      {eventStatusLabel(event.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {formatDate(event.starts_at)}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                  <EventCount label="Lista" value={event.total_count} />
                  <EventCount label="Invitati" value={event.invited_count} />
                  <EventCount
                    label="Senza risposta"
                    value={event.no_response_count}
                    tone={event.no_response_count > 0 ? "attention" : "default"}
                  />
                  <EventCount label="Partecipa" value={event.attending_count} tone="good" />
                  <EventCount label="No" value={event.declined_count} />
                  <EventCount label="Forse" value={event.maybe_count} />
                  <EventCount
                    label="Proposte"
                    value={event.pending_proposal_count}
                    tone={event.pending_proposal_count > 0 ? "attention" : "default"}
                  />
                </div>

                <Link
                  href={`/dashboard/events/${event.id}`}
                  className="justify-self-start rounded-xl bg-[#1b3272] px-3 py-2 text-sm font-semibold text-white hover:bg-[#263f86] xl:justify-self-end"
                >
                  Dettagli
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="m-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Nessun evento aperto o futuro da evidenziare.
          </p>
        )}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {managerCards.map((item) => (
          <NavigationCard key={item.title} item={item} />
        ))}
      </section>
    </>
  );
}

function ReferenceDashboard({ summary }: { summary: ReferenceSummary }) {
  return (
    <>
      {summary.referenceName ? (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Contatti attivi"
            value={summary.assignedActiveCount}
            detail="Contatti assegnati al tuo riferimento."
            href="/dashboard/contacts?status=active"
            icon="check"
            tone="good"
          />
          <MetricCard
            title="Dati mancanti"
            value={summary.assignedMissingCount}
            detail="Schede assegnate che richiedono completamento."
            href="/dashboard/contacts?missing=yes"
            icon="attention"
            tone={summary.assignedMissingCount > 0 ? "attention" : "default"}
          />
          <MetricCard
            title="Non attivi"
            value={summary.assignedStandbyCount}
            detail="Contatti assegnati conservati come non operativi."
            href="/dashboard/contacts?status=standby"
            icon="archive"
          />
          <MetricCard
            title="Proposte da decidere"
            value={summary.pendingProposalCount}
            detail="Richieste del manager in attesa di risposta."
            href="/dashboard/proposals"
            icon="clock"
            tone={summary.pendingProposalCount > 0 ? "attention" : "default"}
          />
        </section>
      ) : (
        <section className="mt-8 rounded-2xl border border-[#f0c2bd] bg-[#fff8f7] p-6 text-sm leading-6 text-slate-700">
          Il tuo profilo non è ancora collegato a un referente interno. Chiedi a un manager di completare
          l&apos;associazione da utenti o referenti.
        </section>
      )}

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="overflow-hidden rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-[#fbfcff] px-5 py-4">
            <div>
              <h2 className="text-xl font-semibold text-[#1b3272]">Proposte recenti</h2>
              <p className="mt-1 text-sm text-slate-600">Contatti da approvare o escludere.</p>
            </div>
            <Link
              href="/dashboard/proposals"
              className="rounded-xl border border-[#d43c2f]/30 px-3 py-2 text-sm font-semibold text-[#d43c2f] hover:bg-[#fff0ef]"
            >
              Apri coda
            </Link>
          </div>

          {summary.upcomingProposals.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {summary.upcomingProposals.map((proposal) => (
                <Link key={proposal.id} href="/dashboard/proposals" className="block px-5 py-4 transition hover:bg-slate-50">
                  <p className="text-sm font-semibold text-[#1b3272]">{proposal.contact_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{proposal.contact_detail || "Nessun dettaglio contatto"}</p>
                  <p className="mt-2 text-xs font-semibold text-[#d43c2f]">
                    {proposal.event_title} · {formatDate(proposal.event_starts_at)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="m-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Nessuna proposta pendente al momento.
            </p>
          )}
        </article>

        <div className="grid gap-4">
          {referenceCards.map((item) => (
            <NavigationCard key={item.title} item={item} />
          ))}
        </div>
      </section>
    </>
  );
}

function NavigationCard({ item }: { item: NavigationItem }) {
  return (
    <Link
      href={item.href}
      className="group flex min-h-32 gap-4 rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#c7d4ec] hover:shadow-md"
    >
      <span className="h-fit rounded-xl bg-[#eef3ff] p-2.5 text-[#1b3272] group-hover:bg-[#1b3272] group-hover:text-white">
        <DashboardIcon name={item.icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-start justify-between gap-3">
          <span className="block text-lg font-semibold text-[#1b3272]">{item.title}</span>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#d9e1f2] text-[#d43c2f] transition group-hover:border-[#d43c2f] group-hover:bg-[#fff0ef]">
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M7 17 17 7" />
              <path d="M9 7h8v8" />
            </svg>
          </span>
        </span>
        <span className="mt-2 block text-sm leading-6 text-slate-600">{item.description}</span>
      </span>
    </Link>
  );
}

function DashboardSidebar({ isManager }: { isManager: boolean }) {
  const items = isManager ? managerCards : referenceCards;

  return (
    <aside className="sticky top-0 hidden h-screen border-r border-[#d9e1f2] bg-white/85 px-5 py-7 backdrop-blur lg:block">
      <div className="mb-9">
        <BrandLogo />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#d43c2f]">
          Segreteria Segidio
        </p>
      </div>
      <nav className="grid gap-1">
        {items.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-[#f5f7fb] hover:text-[#1b3272]"
          >
            <DashboardIcon name={item.icon} className="h-4 w-4" />
            {item.title}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const isManager = profile.role === "manager";
  const dashboard = isManager
    ? await loadManagerDashboard()
    : await loadReferenceDashboard(profile.id);

  return (
    <main className="min-h-screen bg-[#f4f7fb] lg:grid lg:grid-cols-[220px_1fr]">
      <DashboardSidebar isManager={isManager} />
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#d9e1f2] bg-white px-5 py-4 shadow-sm">
            <div className="flex min-w-0 items-center gap-4">
              <div className="shrink-0 lg:hidden">
                <BrandLogo />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d43c2f]">
                  Segreteria Segidio
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-[#1b3272] sm:text-3xl">
                  Bentornato, {profile.first_name}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {isManager
                    ? "Cruscotto operativo manager"
                    : `Vista referente${"referenceName" in dashboard && dashboard.referenceName ? ` · ${dashboard.referenceName}` : ""}`}
                </p>
              </div>
            </div>
            <LogoutButton />
          </header>

          {isManager ? (
            <ManagerDashboard summary={dashboard as Awaited<ReturnType<typeof loadManagerDashboard>>} />
          ) : (
            <ReferenceDashboard summary={dashboard as ReferenceSummary} />
          )}
        </div>
      </div>
    </main>
  );
}
