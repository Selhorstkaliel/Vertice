-- AlterTable
ALTER TABLE "FlashcardReview" ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FlashcardReview_clientId_key" ON "FlashcardReview"("clientId");

