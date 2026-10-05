-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- Project yang sudah ada diberi ID berurutan (PRJ-0001, …) sesuai urutan dibuat; bisa diubah Admin.
UPDATE "Project" p SET "code" = 'PRJ-' || LPAD(n::text, 4, '0')
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS n FROM "Project") s
WHERE p.id = s.id AND p."code" IS NULL;
