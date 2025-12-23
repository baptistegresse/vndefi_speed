/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `invoices` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "externalId" TEXT;

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_eventId_key" ON "webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "webhook_events_provider_idx" ON "webhook_events"("provider");

-- CreateIndex
CREATE INDEX "webhook_events_eventId_idx" ON "webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "webhook_events_type_idx" ON "webhook_events"("type");

-- CreateIndex
CREATE INDEX "webhook_events_processedAt_idx" ON "webhook_events"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_externalId_key" ON "invoices"("externalId");

-- CreateIndex
CREATE INDEX "invoices_externalId_idx" ON "invoices"("externalId");
