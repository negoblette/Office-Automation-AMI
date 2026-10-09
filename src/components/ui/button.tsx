import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Versi tenang (docs/design/prototipe-halaman-oa.html §4): semua tombol berbentuk pil.
// default = .btn-blue, outline = .btn-line, secondary = .btn-tint, ghost = .ghost, link = .linkish.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-full border-0 text-sm font-bold whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-300 ease-smooth outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink focus-visible:outline-solid active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:shadow-[inset_0_0_0_2px_var(--red)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  {
    variants: {
      variant: {
        default: "bg-brand text-white shadow-(--elev-btn) hover:bg-brand-deep",
        outline:
          "bg-white text-ink-2 shadow-[inset_0_0_0_1px_var(--edge)] hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--ink)] aria-expanded:text-ink aria-expanded:shadow-[inset_0_0_0_1px_var(--ink)] disabled:bg-transparent disabled:text-mute disabled:opacity-100 disabled:shadow-[inset_0_0_0_1px_var(--line)]",
        secondary: "bg-brand-soft text-brand-deep hover:bg-brand-tint aria-expanded:bg-brand-tint",
        ghost: "text-ink-2 hover:bg-ink/[0.07] hover:text-ink active:scale-95 aria-expanded:bg-ink/[0.07]",
        destructive:
          "bg-red-soft text-red-deep hover:bg-[color-mix(in_srgb,var(--red-soft),var(--red)_12%)] focus-visible:outline-red",
        link: "rounded-lg text-brand-deep underline-offset-4 hover:text-brand hover:underline active:scale-100",
      },
      size: {
        default: "h-11 px-4",
        xs: "h-8 gap-1 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1.5 px-3.5 text-[13.5px] [&_svg:not([class*='size-'])]:size-4",
        lg: "h-11 px-4",
        icon: "size-11 rounded-[14px]",
        "icon-xs": "size-8 rounded-[10px] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9 rounded-[12px] [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-11 rounded-[14px]",
      },
    },
    compoundVariants: [
      { variant: "link", size: ["default", "xs", "sm", "lg"], class: "h-auto min-h-9 px-1" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
