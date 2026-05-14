import clsx from "clsx";

export type BadgeStatus = "upcoming" | "live" | "closed" | "finalizing" | "finalized" | "reserve-not-met" | "failed" | "cancelled";

const labels: Record<BadgeStatus, string> = {
  upcoming: "Upcoming",
  live: "Live",
  closed: "Closed",
  finalizing: "Finalizing",
  finalized: "Finalized",
  "reserve-not-met": "Reserve not met",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: BadgeStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-2 py-1 text-xs font-bold uppercase",
        status === "live" && "bg-mint/15 text-mint",
        status === "closed" && "bg-fog/15 text-fog",
        status === "finalizing" && "bg-brass/15 text-brass",
        status === "finalized" && "bg-white/15 text-white",
        status === "upcoming" && "bg-fog/10 text-fog",
        status === "reserve-not-met" && "bg-signal/15 text-signal",
        status === "failed" && "bg-signal/15 text-signal",
        status === "cancelled" && "bg-signal/10 text-fog/50",
      )}
    >
      {labels[status]}
    </span>
  );
}
