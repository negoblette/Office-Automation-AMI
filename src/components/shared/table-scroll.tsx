"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Pembungkus tabel/grid lebar yang bisa digeser ke samping (audit UI 2026-10-27).
 * Hanya saat isinya benar-benar lebih lebar dari layar: jadi wilayah berlabel yang bisa difokus (Tab lalu
 * panah kiri/kanan — WCAG 2.1.1, axe `scrollable-region-focusable`) dan diberi bayangan tepi sebagai tanda
 * masih ada kolom di samping. Di layar lebar tidak menambah tab stop.
 */
export function TableScroll({
  label,
  shade = true,
  className,
  children,
  as: Tag = "div",
}: {
  /** Nama wilayah untuk pembaca layar, mis. "Tabel rekap absensi". */
  label: string;
  /** Bayangan tepi (latar --card). Matikan bila latar pembungkus bukan putih. */
  shade?: boolean;
  className?: string;
  children: React.ReactNode;
  as?: "div" | "section";
}) {
  const ref = useRef<HTMLElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const check = () => setScrollable(element.scrollWidth > element.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      role={scrollable ? "region" : undefined}
      aria-label={scrollable ? label : undefined}
      tabIndex={scrollable ? 0 : undefined}
      className={cn(
        "overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        shade && scrollable && "scroll-shade-x",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
