// Respons unduhan Excel untuk route ekspor (/api/export/*).

export function textResponse(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export function xlsxResponse(data: Uint8Array, fileName: string) {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Nama file: satu karyawan → namanya; lebih → "N karyawan". */
export function exportSubject(names: string[]) {
  const unique = [...new Set(names)];
  return unique.length === 1 ? unique[0] : `${unique.length} karyawan`;
}
