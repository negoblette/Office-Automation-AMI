"use client";

// Komponen gerak Dashboard — murni tampilan: tidak membaca/mengubah data dan tidak memanggil aksi.
// Animasi CSS-nya ada di dashboard.module.css (mati saat prefers-reduced-motion).
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./dashboard.module.css";

const jakartaTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type JakartaClock = { hm: string; ss: string; secondsOfDay: number };

function readClock(date: Date): JakartaClock {
  const text = jakartaTime.format(date); // "14:05:09"
  const [h, m, s] = text.split(":").map(Number);
  return { hm: text.slice(0, 5), ss: text.slice(5), secondsOfDay: h * 3600 + m * 60 + s };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Jam Jakarta yang berjalan, hanya untuk tampilan (jam absen resmi tetap dari server).
 * `null` sebelum terpasang di browser supaya tidak terjadi hydration mismatch.
 */
export function useJakartaClock(): JakartaClock | null {
  const [clock, setClock] = useState<JakartaClock | null>(null);
  useEffect(() => {
    const tick = () => setClock(readClock(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return clock;
}

/** Menandai 2 detik pertama setelah halaman dibuka; animasi pembuka di CSS hanya berjalan selama itu. */
export function IntroScope({ className, children }: { className?: string; children: React.ReactNode }) {
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setIntro(false), 2000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className={cn(styles.motionScope, className)} data-intro={intro ? "" : undefined}>
      {children}
    </div>
  );
}

/** Jam analog dekoratif di kanan judul. */
export function Dial() {
  const clock = useJakartaClock();
  const seconds = clock?.secondsOfDay;
  return (
    <div className={styles.dial} aria-hidden>
      <span className={styles.dialRing} />
      <span className={styles.dialMinutes} />
      <span className={styles.dialHours} />
      {seconds !== undefined && (
        <>
          <span className={cn(styles.hand, styles.handHour)} style={{ transform: `rotate(${seconds / 120}deg)` }} />
          <span className={cn(styles.hand, styles.handMinute)} style={{ transform: `rotate(${seconds / 10}deg)` }} />
          <span className={cn(styles.hand, styles.handSecond)} style={{ transform: `rotate(${seconds * 6}deg)` }} />
        </>
      )}
      <span className={styles.hub} />
    </div>
  );
}

/**
 * Angka statistik. Saat halaman dibuka menghitung naik dari 0; bila nilainya berubah setelah data
 * di-refresh (mis. selesai approve) langsung tampil dengan efek "bump". Nilai yang dirender server
 * sama dengan data, jadi tanpa JavaScript angkanya tetap benar.
 */
export function StatNumber({ value, order = 0, className }: { value: number; order?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [previous, setPrevious] = useState(value);
  const [bumps, setBumps] = useState(0);
  const target = useRef(value);

  if (value !== previous) {
    setPrevious(value);
    setShown(value);
    setBumps((count) => count + 1);
  }

  useEffect(() => {
    target.current = value;
  }, [value]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const startAt = performance.now() + 380 + order * 70;
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, Math.max(0, (now - startAt) / 700));
      setShown(Math.round(target.current * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [order]);

  return (
    <span key={bumps} className={cn(className, bumps > 0 && styles.bump)}>
      {shown}
    </span>
  );
}

/** Susunan kertas di baki menurut jumlah antrian (maksimal 4 lembar). */
const FAN: (keyof typeof styles)[][] = [[], ["p0"], ["p2", "p3"], ["p1", "p0", "p4"], ["p1", "p2", "p3", "p4"]];

/** Piktogram baki kertas untuk "Antrian approval Anda"; satu kertas terbang keluar saat antrian berkurang. */
export function PaperTray({ count }: { count: number }) {
  const [previous, setPrevious] = useState(count);
  const [flights, setFlights] = useState<number[]>([]);

  if (count !== previous) {
    setPrevious(count);
    if (count < previous) setFlights((list) => [...list, (list.at(-1) ?? 0) + 1]);
  }

  return (
    <span className={styles.papers} aria-hidden>
      <span className={styles.paperBack} />
      {count === 0 && <span className={styles.ghostPage} />}
      {FAN[Math.min(count, 4)].map((position) => (
        <span key={position} className={cn(styles.page, styles[position])} />
      ))}
      {flights.map((id) => (
        <span
          key={`terbang-${id}`}
          className={cn(styles.page, styles.fly)}
          onAnimationEnd={() => setFlights((list) => list.filter((item) => item !== id))}
        />
      ))}
      <span className={styles.paperBox} />
    </span>
  );
}
