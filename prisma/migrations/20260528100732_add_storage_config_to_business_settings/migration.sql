-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "storageAccessKey" TEXT,
ADD COLUMN     "storageBucket" TEXT,
ADD COLUMN     "storageEndpoint" TEXT,
ADD COLUMN     "storageProvider" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN     "storagePublicUrl" TEXT,
ADD COLUMN     "storageRegion" TEXT,
ADD COLUMN     "storageSecretKey" TEXT;
