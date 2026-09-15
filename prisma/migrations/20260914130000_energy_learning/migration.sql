-- AlterTable
ALTER TABLE "EnergyPeriod" ADD COLUMN     "learnedAt" TIMESTAMP(3),
ADD COLUMN     "learnedEvidence" JSONB;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "energyLearning" BOOLEAN NOT NULL DEFAULT true;

