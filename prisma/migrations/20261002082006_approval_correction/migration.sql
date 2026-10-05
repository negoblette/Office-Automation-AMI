-- CreateTable
CREATE TABLE "ApprovalCorrection" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalCorrection_requestId_idx" ON "ApprovalCorrection"("requestId");

-- AddForeignKey
ALTER TABLE "ApprovalCorrection" ADD CONSTRAINT "ApprovalCorrection_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalCorrection" ADD CONSTRAINT "ApprovalCorrection_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
