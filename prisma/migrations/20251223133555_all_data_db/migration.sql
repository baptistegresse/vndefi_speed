-- CreateEnum
CREATE TYPE "AffiliateUserStatus" AS ENUM ('SIGNUP', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "AffiliateSource" AS ENUM ('QR', 'LINK', 'API');

-- CreateEnum
CREATE TYPE "RevenueEventType" AS ENUM ('CPA', 'DEPOSIT', 'REVENUE_SHARE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('CRYPTO', 'FIAT');

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "affiliationCode" TEXT NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_users" (
    "id" TEXT NOT NULL,
    "status" "AffiliateUserStatus" NOT NULL DEFAULT 'SIGNUP',
    "partnerUserId" TEXT NOT NULL,
    "acquisitionSource" "AffiliateSource" NOT NULL DEFAULT 'QR',
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "walletProviderId" TEXT NOT NULL,

    CONSTRAINT "affiliate_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "cpaAmount" DOUBLE PRECISION NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "eventType" "RevenueEventType" NOT NULL DEFAULT 'CPA',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "grossRevenue" DOUBLE PRECISION NOT NULL,
    "currency" TEXT,
    "amountInCurrency" DOUBLE PRECISION,
    "transactionHash" TEXT,
    "rawPayload" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "affiliateUserId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "walletProviderId" TEXT NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "eventType" "RevenueEventType" NOT NULL DEFAULT 'CPA',
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "grossRevenue" DOUBLE PRECISION NOT NULL,
    "netRevenue" DOUBLE PRECISION NOT NULL,
    "platformRevenue" DOUBLE PRECISION NOT NULL,
    "availableAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "walletProviderId" TEXT NOT NULL,
    "affiliateUserId" TEXT NOT NULL,
    "invoiceId" TEXT,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "requestedAmount" DOUBLE PRECISION NOT NULL,
    "payoutAmount" DOUBLE PRECISION,
    "paymentType" "PaymentType" NOT NULL,
    "destinationAddress" TEXT,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "transactionHash" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_affiliationCode_key" ON "shops"("affiliationCode");

-- CreateIndex
CREATE UNIQUE INDEX "shops_userId_key" ON "shops"("userId");

-- CreateIndex
CREATE INDEX "shops_isActive_idx" ON "shops"("isActive");

-- CreateIndex
CREATE INDEX "affiliate_users_shopId_idx" ON "affiliate_users"("shopId");

-- CreateIndex
CREATE INDEX "affiliate_users_walletProviderId_idx" ON "affiliate_users"("walletProviderId");

-- CreateIndex
CREATE INDEX "affiliate_users_status_idx" ON "affiliate_users"("status");

-- CreateIndex
CREATE INDEX "affiliate_users_partnerUserId_idx" ON "affiliate_users"("partnerUserId");

-- CreateIndex
CREATE INDEX "affiliate_users_walletProviderId_partnerUserId_idx" ON "affiliate_users"("walletProviderId", "partnerUserId");

-- CreateIndex
CREATE INDEX "affiliate_users_acquisitionSource_idx" ON "affiliate_users"("acquisitionSource");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_providers_apiKey_key" ON "wallet_providers"("apiKey");

-- CreateIndex
CREATE INDEX "wallet_providers_isActive_idx" ON "wallet_providers"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_transactionHash_key" ON "invoices"("transactionHash");

-- CreateIndex
CREATE INDEX "invoices_shopId_idx" ON "invoices"("shopId");

-- CreateIndex
CREATE INDEX "invoices_walletProviderId_idx" ON "invoices"("walletProviderId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_eventType_idx" ON "invoices"("eventType");

-- CreateIndex
CREATE INDEX "invoices_affiliateUserId_idx" ON "invoices"("affiliateUserId");

-- CreateIndex
CREATE INDEX "invoices_shopId_createdAt_idx" ON "invoices"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "invoices_shopId_status_createdAt_idx" ON "invoices"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "commissions_shopId_status_idx" ON "commissions"("shopId", "status");

-- CreateIndex
CREATE INDEX "commissions_status_idx" ON "commissions"("status");

-- CreateIndex
CREATE INDEX "commissions_eventType_idx" ON "commissions"("eventType");

-- CreateIndex
CREATE INDEX "commissions_affiliateUserId_idx" ON "commissions"("affiliateUserId");

-- CreateIndex
CREATE INDEX "commissions_invoiceId_idx" ON "commissions"("invoiceId");

-- CreateIndex
CREATE INDEX "commissions_shopId_createdAt_idx" ON "commissions"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_transactionHash_key" ON "withdrawals"("transactionHash");

-- CreateIndex
CREATE INDEX "withdrawals_shopId_idx" ON "withdrawals"("shopId");

-- CreateIndex
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

-- CreateIndex
CREATE INDEX "withdrawals_paymentType_idx" ON "withdrawals"("paymentType");

-- CreateIndex
CREATE INDEX "withdrawals_shopId_createdAt_idx" ON "withdrawals"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_users" ADD CONSTRAINT "affiliate_users_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_users" ADD CONSTRAINT "affiliate_users_walletProviderId_fkey" FOREIGN KEY ("walletProviderId") REFERENCES "wallet_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_affiliateUserId_fkey" FOREIGN KEY ("affiliateUserId") REFERENCES "affiliate_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_walletProviderId_fkey" FOREIGN KEY ("walletProviderId") REFERENCES "wallet_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_walletProviderId_fkey" FOREIGN KEY ("walletProviderId") REFERENCES "wallet_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_affiliateUserId_fkey" FOREIGN KEY ("affiliateUserId") REFERENCES "affiliate_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
