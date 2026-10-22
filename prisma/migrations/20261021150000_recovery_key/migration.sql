-- Kunci pemulihan pemegang kunci (docs/08-INVENTARIS-DATA.md §4–5): pengganti penitipan kunci lewat perintah age di
-- laptop Direktur. Direktur membuat kata sandi pemulihan di Setting → Kunci Pemulihan; kunci age pribadinya (terkunci
-- kata sandi itu) disimpan sebagai file di RECOVERY_DIR, tabel ini hanya menyimpan kunci publik & riwayatnya.
-- Hak oa_app atas tabel baru mengikuti ALTER DEFAULT PRIVILEGES di deploy/postgres/init-roles.sh.

-- CreateTable
CREATE TABLE "RecoveryKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RecoveryKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoveryKey_userId_idx" ON "RecoveryKey"("userId");

-- AddForeignKey
ALTER TABLE "RecoveryKey" ADD CONSTRAINT "RecoveryKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
