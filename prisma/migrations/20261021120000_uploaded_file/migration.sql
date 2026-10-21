-- Hardening Tahap 7 - catatan upload (pengunggah & ukuran): hanya pengunggah yang boleh menautkan file, kuota upload per orang.
-- CreateTable
CREATE TABLE "UploadedFile" (
    "key" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "UploadedFile_uploaderId_createdAt_idx" ON "UploadedFile"("uploaderId", "createdAt");

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
