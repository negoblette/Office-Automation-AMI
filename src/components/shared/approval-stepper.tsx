import { Check, Clock, Minus } from "lucide-react";
import type { RequestStatus, StepStatus } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STEP_STATUS_LABEL } from "./approval-status";

export type ApprovalStepView = {
  level: number;
  /** Nama approver; lebih dari satu = salah satu cukup. */
  approvers: string[];
  status: StepStatus;
  actedBy?: string | null;
  actedAt?: Date | string | null;
};

type ApprovalStepperProps = {
  steps: ApprovalStepView[];
  requestStatus: RequestStatus;
  /** Versi ringkas untuk sel tabel. */
  compact?: boolean;
  className?: string;
};

const circleClasses: Record<StepStatus, string> = {
  APPROVED: "bg-success text-white",
  PENDING: "bg-info-soft text-primary ring-2 ring-primary",
  WAITING: "bg-muted text-muted-foreground",
  SKIPPED: "bg-muted text-muted-foreground",
  REJECTED: "bg-danger text-white",
};

/**
 * Alur approval sebuah pengajuan: L1 → L2 → Disetujui (snapshot `ApprovalRequestStep`).
 * Pengajuan tanpa step yang langsung APPROVED (flow tanpa level / otomatis) tampil "Disetujui otomatis".
 */
export function ApprovalStepper({ steps, requestStatus, compact = false, className }: ApprovalStepperProps) {
  const approved = requestStatus === "APPROVED";

  if (steps.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {approved ? "Disetujui otomatis (tanpa approval)" : "Belum diajukan"}
      </p>
    );
  }

  return (
    <ol className={cn("flex flex-wrap items-start", compact ? "gap-x-2 gap-y-1" : "gap-x-3 gap-y-3", className)}>
      {steps.map((step) => {
        const Icon = step.status === "APPROVED" ? Check : step.status === "SKIPPED" ? Minus : Clock;
        return (
          <li key={step.level} className="flex items-start gap-2">
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full",
                compact ? "size-5" : "size-7",
                circleClasses[step.status],
              )}
              aria-hidden
            >
              <Icon className={compact ? "size-3" : "size-4"} />
            </span>
            <div className={cn("min-w-0", compact ? "text-xs" : "text-sm")}>
              <p className={cn("font-medium", step.status === "SKIPPED" && "text-muted-foreground line-through")}>
                L{step.level} · {step.approvers.join(" / ")}
              </p>
              {!compact && (
                <p className="text-xs text-muted-foreground">
                  {STEP_STATUS_LABEL[step.status]}
                  {step.status === "APPROVED" && step.actedBy && ` oleh ${step.actedBy}`}
                  {step.status === "APPROVED" && step.actedAt && ` · ${formatDateTime(step.actedAt)}`}
                </p>
              )}
            </div>
            <span className={cn("text-muted-foreground", compact ? "text-xs" : "mt-1 text-sm")} aria-hidden>
              →
            </span>
          </li>
        );
      })}
      <li className="flex items-start gap-2">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full",
            compact ? "size-5" : "size-7",
            approved ? "bg-success text-white" : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          <Check className={compact ? "size-3" : "size-4"} />
        </span>
        <p className={cn("font-medium", compact ? "text-xs" : "mt-1 text-sm", !approved && "text-muted-foreground")}>
          Disetujui
        </p>
      </li>
    </ol>
  );
}
