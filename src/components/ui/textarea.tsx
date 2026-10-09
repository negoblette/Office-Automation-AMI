import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Gaya sama dengan Input (versi tenang), tinggi minimal 92px.
        "flex field-sizing-content min-h-[92px] w-full rounded-[14px] border-0 bg-white px-3.5 py-[11px] text-base leading-normal text-ink shadow-[inset_0_0_0_1px_var(--edge)] transition-[box-shadow,background-color] duration-300 ease-smooth outline-none placeholder:text-mute hover:shadow-[inset_0_0_0_1px_var(--ink)] focus-visible:shadow-[inset_0_0_0_2px_var(--brand),0_0_0_4px_var(--brand-ring)] disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute disabled:shadow-[inset_0_0_0_1px_var(--line)] aria-invalid:shadow-[inset_0_0_0_2px_var(--red)] aria-invalid:focus-visible:shadow-[inset_0_0_0_2px_var(--red),0_0_0_4px_var(--red-ring)] md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
