/*
  Warnings:

  - You are about to drop the column `iconUrl` on the `Champion` table. All the data in the column will be lost.
  - You are about to drop the column `splashUrl` on the `Champion` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Champion" DROP COLUMN "iconUrl",
DROP COLUMN "splashUrl",
ADD COLUMN     "iconKey" TEXT,
ADD COLUMN     "splashKey" TEXT;
