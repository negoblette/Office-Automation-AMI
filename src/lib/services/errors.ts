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
