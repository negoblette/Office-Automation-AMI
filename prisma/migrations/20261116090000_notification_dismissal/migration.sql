-- Notifikasi lonceng yang sudah dibuka / dihapus user (2026-11-16). Lonceng tetap dihitung dari data terkini;
-- tabel ini hanya menyembunyikan satu notifikasi untuk satu user, di semua perangkatnya. Tanpa data pribadi.
CREATE TABLE "NotificationDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "context" TEXT[],
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationDismissal_userId_key_key" ON "NotificationDismissal"("userId", "key");

ALTER TABLE "NotificationDismissal" ADD CONSTRAINT "NotificationDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
