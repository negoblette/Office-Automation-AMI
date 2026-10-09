import { useEffect, useState } from "react";

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
