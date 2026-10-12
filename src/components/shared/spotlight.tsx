import { cn } from "@/lib/utils";
import styles from "./spotlight.module.css";

/**
 * Sorotan halaman (versi seimbang): satu per halaman, untuk ringkasan yang paling penting.
 * `className` = tata letak isi panel (mis. grid dua kolom); `style` = urutan gerak masuk (`riseStyle`).
 */
export function Spotlight({
  label,
  className,
  style,
  children,
}: {
  /** Nama bagian untuk pembaca layar. */
  label: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} className={cn(styles.shell, "rise")} style={style}>
      <div className={cn(styles.panel, className)}>{children}</div>
    </section>
  );
}
