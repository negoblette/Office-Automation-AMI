import { cn } from "@/lib/utils";
import styles from "./stats-band.module.css";

/**
 * Pita angka: satu permukaan lembut berisi beberapa `Stat`, dipisah garis. Pengganti kartu
 * statistik berjajar. `four` untuk empat bagian; `size="lg"` khusus Dashboard (angka 48px).
 */
export function StatsBand({
  children,
  label = "Ringkasan",
  size = "md",
  four = false,
  className,
  style,
}: {
  children: React.ReactNode;
  /** Label untuk pembaca layar. */
  label?: string;
  size?: "md" | "lg";
  four?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section aria-label={label} className={cn("panel-surface", styles.band, size === "lg" && styles.lg, four && styles.four, className)} style={style}>
      {children}
    </section>
  );
}

/** Satu angka di pita: label, angka, satuan, dan paling banyak satu baris keterangan. */
export function Stat({
  label,
  value,
  unit,
  sub,
  warn = false,
  aside,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: React.ReactNode;
  /** Keterangan di bawah angka. */
  sub?: React.ReactNode;
  /** Keterangan diberi warna perlu perhatian. */
  warn?: boolean;
  /** Isi di kanan angka (Dashboard: piktogram). */
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(styles.stat, className)}>
      <div className={styles.top}>
        <div className="min-w-0">
          <span className={styles.label}>{label}</span>
          <span className={styles.value}>
            <span className={styles.num}>{value}</span>
            {unit && <span className={styles.unit}>{unit}</span>}
          </span>
        </div>
        {aside}
      </div>
      {sub && <div className={cn(styles.sub, warn && styles.warn)}>{sub}</div>}
    </div>
  );
}
