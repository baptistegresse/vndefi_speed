import { config } from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";

// Charger les variables d'environnement depuis .env
config();

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // Créer un shop de test
  const shop = await prisma.shop.upsert({
    where: { affiliationCode: "TEST-SHOP-SEED" },
    update: {},
    create: {
      name: "Test Shop",
      address: "123 Test Street",
      affiliationCode: "TEST-SHOP-SEED",
      commissionRate: 0.15,
      isActive: true,
      // userId sera null - à attribuer manuellement
    },
  });

  console.log(`✅ Shop créé: ${shop.id} (${shop.name})`);

  // Créer un wallet provider de test
  const walletProvider = await prisma.walletProvider.upsert({
    where: { apiKey: "test-wallet-provider-seed" },
    update: {},
    create: {
      name: "Test Wallet Provider",
      apiKey: "test-wallet-provider-seed",
      isActive: true,
      cpaAmount: 10.0,
    },
  });

  console.log(`✅ Wallet Provider créé: ${walletProvider.id}`);

  // Supprimer les anciennes données pour ce shop (si elles existent)
  await prisma.commission.deleteMany({
    where: { shopId: shop.id },
  });
  await prisma.withdrawal.deleteMany({
    where: { shopId: shop.id },
  });
  await prisma.affiliateUser.deleteMany({
    where: { shopId: shop.id },
  });

  // Créer un affiliate user de test
  const affiliateUser = await prisma.affiliateUser.create({
    data: {
      status: "ACTIVE",
      partnerUserId: "partner-test-seed",
      acquisitionSource: "QR",
      shopId: shop.id,
      walletProviderId: walletProvider.id,
      activatedAt: new Date(),
    },
  });

  console.log(`✅ Affiliate User créé: ${affiliateUser.id}`);

  // Créer des commissions PAID
  await prisma.commission.createMany({
    data: [
      {
        eventType: "CPA",
        status: "PAID",
        grossRevenue: 1000.0,
        netRevenue: 850.0,
        platformRevenue: 150.0,
        shopId: shop.id,
        walletProviderId: walletProvider.id,
        affiliateUserId: affiliateUser.id,
        availableAt: new Date(),
      },
      {
        eventType: "DEPOSIT",
        status: "PAID",
        grossRevenue: 500.0,
        netRevenue: 425.0,
        platformRevenue: 75.0,
        shopId: shop.id,
        walletProviderId: walletProvider.id,
        affiliateUserId: affiliateUser.id,
        availableAt: new Date(),
      },
      {
        eventType: "REVENUE_SHARE",
        status: "PAID",
        grossRevenue: 2000.0,
        netRevenue: 1700.0,
        platformRevenue: 300.0,
        shopId: shop.id,
        walletProviderId: walletProvider.id,
        affiliateUserId: affiliateUser.id,
        availableAt: new Date(),
      },
    ],
  });

  console.log("✅ 3 commissions PAID créées (total: 2975€)");

  // Créer des commissions PENDING
  await prisma.commission.createMany({
    data: [
      {
        eventType: "CPA",
        status: "PENDING",
        grossRevenue: 800.0,
        netRevenue: 680.0,
        platformRevenue: 120.0,
        shopId: shop.id,
        walletProviderId: walletProvider.id,
        affiliateUserId: affiliateUser.id,
      },
      {
        eventType: "DEPOSIT",
        status: "PENDING",
        grossRevenue: 300.0,
        netRevenue: 255.0,
        platformRevenue: 45.0,
        shopId: shop.id,
        walletProviderId: walletProvider.id,
        affiliateUserId: affiliateUser.id,
      },
    ],
  });

  console.log("✅ 2 commissions PENDING créées (total: 935€)");

  // Créer des withdrawals PENDING
  await prisma.withdrawal.createMany({
    data: [
      {
        requestedAmount: 500.0,
        paymentType: "CRYPTO",
        destinationAddress: "0x1234567890abcdef",
        status: "PENDING",
        shopId: shop.id,
      },
      {
        requestedAmount: 300.0,
        paymentType: "FIAT",
        status: "PENDING",
        shopId: shop.id,
      },
    ],
  });

  console.log("✅ 2 withdrawals PENDING créés (total: 800€)");

  // Afficher le résumé
  const [commissionsPaid, commissionsPending, withdrawalsPending] =
    await Promise.all([
      prisma.commission.aggregate({
        where: {
          shopId: shop.id,
          status: "PAID",
        },
        _sum: {
          netRevenue: true,
        },
      }),
      prisma.commission.aggregate({
        where: {
          shopId: shop.id,
          status: "PENDING",
        },
        _sum: {
          netRevenue: true,
        },
      }),
      prisma.withdrawal.aggregate({
        where: {
          shopId: shop.id,
          status: "PENDING",
        },
        _sum: {
          requestedAmount: true,
        },
      }),
    ]);

  const totalCommissionsPaid = commissionsPaid._sum.netRevenue ?? 0;
  const totalCommissionsPending = commissionsPending._sum.netRevenue ?? 0;
  const totalWithdrawalsPending = withdrawalsPending._sum.requestedAmount ?? 0;
  const availableBalance = Math.max(
    0,
    totalCommissionsPaid - totalWithdrawalsPending
  );

  console.log("\n📊 Résumé du Money Truth:");
  console.log(`   Commissions PAID: ${totalCommissionsPaid}€`);
  console.log(`   Commissions PENDING: ${totalCommissionsPending}€`);
  console.log(`   Withdrawals PENDING: ${totalWithdrawalsPending}€`);
  console.log(`   Available Balance: ${availableBalance}€`);

  console.log(`\n🎯 Pour attribuer ce shop à votre user, exécutez:`);
  console.log(
    `   UPDATE shops SET "userId" = 'VOTRE_USER_ID' WHERE id = '${shop.id}';`
  );
  console.log(`\n✅ Seed terminé avec succès !`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur lors du seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

