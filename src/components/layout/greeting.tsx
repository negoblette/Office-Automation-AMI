"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const jakartaHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23" });

function greetingFor(hour: number): string {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

/**
 * Sapaan di topbar menurut jam Jakarta (hanya tampilan). Dihitung setelah terpasang di browser
 * supaya tidak terjadi hydration mismatch; sebelum itu tempatnya dicadangkan tanpa terlihat.
 */
export function Greeting({ name, className }: { name: string; className?: string }) {
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setGreeting(greetingFor(Number(jakartaHour.format(new Date()))));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className={cn(!greeting && "invisible", className)}>
      {greeting ?? "Selamat datang"}, {name}
    </p>
  );
}
