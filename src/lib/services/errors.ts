/**
 * Error aturan bisnis dari service. Pesan berbahasa Indonesia dan aman ditampilkan ke
 * user; `field` diisi jika error terkait satu input form (mis. "nik").
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/** Cek service untuk satu baris form berbaris: `field` error-nya diberi awalan baris (mis. `units.2.serialNo`). */
export async function onRow<T>(prefix: string, check: () => Promise<T>): Promise<T> {
  try {
    return await check();
  } catch (error) {
    if (error instanceof ServiceError && error.field) throw new ServiceError(error.message, `${prefix}.${error.field}`);
    throw error;
  }
}
