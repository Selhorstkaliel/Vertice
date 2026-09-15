-- DropIndex
DROP INDEX "StudyPlan_userId_weekStart_version_key";

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "forkedFromId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StudyPlan_userId_weekStart_key" ON "StudyPlan"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "Competition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

