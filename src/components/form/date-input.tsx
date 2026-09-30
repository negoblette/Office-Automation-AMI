import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Input tanggal tanpa jam. Nilai berformat `YYYY-MM-DD` (cocok dengan `isoDateSchema`);
 * gunakan `toJakartaIsoDate()` untuk default "hari ini".
 */
export function DateInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <Input type="date" className={cn("h-10 bg-background", className)} {...props} />;
}
