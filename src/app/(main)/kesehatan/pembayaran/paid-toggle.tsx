"use client";

import { Check, Loader2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setPayoutPaidAction } from "../actions";

/** Tandai dibayar / batalkan tanda dibayar. */
export function PaidToggle({ payoutId, paid }: { payoutId: string; paid: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={paid ? "ghost" : "outline"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setPayoutPaidAction(payoutId, !paid);
          if (result.ok) router.refresh();
          else window.alert(result.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : paid ? <Undo2 aria-hidden /> : <Check aria-hidden />}
      {paid ? "Batalkan" : "Tandai dibayar"}
    </Button>
  );
}
