"use client";

import { Eye } from "lucide-react";
import { TableScroll } from "@/components/shared/table-scroll";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { type ChangePreview, parseChangeLines } from "@/lib/profile-change-lines";
import { cn } from "@/lib/utils";

/** Tabel pratinjau perubahan data: Data | Sebelum | Sesudah (2026-10-13). */
export function ChangeTable({ preview, className }: { preview: ChangePreview; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {preview.context.map((line) => (
        <p key={line} className="text-sm font-medium">
          {line}
        </p>
      ))}
      {preview.rows.length > 0 && (
        <TableScroll label="Perubahan data" className="rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Sebelum</th>
                <th className="px-3 py-2">Sesudah</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.label} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{row.label}</td>
                  <td className="px-3 py-2 text-muted-foreground line-through decoration-muted-foreground/50">{row.before}</td>
                  <td className="px-3 py-2 font-semibold text-foreground">{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}

/** Tombol "Lihat perubahan (n)" → dialog berisi tabel pratinjau. */
export function ChangePreviewButton({ title, lines }: { title: string; lines: string[] }) {
  const preview = parseChangeLines(lines);
  const count = preview.rows.length || lines.length;
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" className="w-fit" />}>
        <Eye aria-hidden /> Lihat perubahan ({count})
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Data baru berubah setelah pengajuan ini disetujui.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <ChangeTable preview={preview} />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Tutup</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
