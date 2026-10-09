import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // Versi tenang: tinggi 46px, radius 14, garis --edge, fokus biru dengan cincin, salah = garis merah.
        "h-[46px] w-full min-w-0 rounded-[14px] border-0 bg-white px-3.5 py-1 text-base text-ink shadow-[inset_0_0_0_1px_var(--edge)] transition-[box-shadow,background-color] duration-300 ease-smooth outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-mute hover:shadow-[inset_0_0_0_1px_var(--ink)] focus-visible:shadow-[inset_0_0_0_2px_var(--brand),0_0_0_4px_var(--brand-ring)] disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute disabled:shadow-[inset_0_0_0_1px_var(--line)] aria-invalid:shadow-[inset_0_0_0_2px_var(--red)] aria-invalid:focus-visible:shadow-[inset_0_0_0_2px_var(--red),0_0_0_4px_var(--red-ring)] md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
