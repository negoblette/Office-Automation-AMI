import { z } from "zod";
import { isoDateSchema, optionalField, textSchema, withDateRange } from "./common";

/** Aset sederhana per karyawan (Fase 14): nama barang, serial, tanggal terima / kembali. */
export const employeeAssetSchema = withDateRange(
  z.object({
    name: textSchema("Nama barang", { min: 2, max: 150 }),
    serialNo: optionalField(textSchema("Serial number", { max: 100 }).toUpperCase()),
    receivedDate: isoDateSchema,
    returnedDate: optionalField(isoDateSchema),
    note: optionalField(textSchema("Catatan", { max: 300 })),
  }),
  "receivedDate",
  "returnedDate",
  "Tanggal kembali tidak boleh sebelum tanggal terima",
);
export type EmployeeAssetInput = z.infer<typeof employeeAssetSchema>;
