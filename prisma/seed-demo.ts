import { config } from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";

config();

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding demo data...\n");

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: "baptiste5gresse@gmail.com" },
  });

  if (!user) {
    console.log("❌ User with email baptiste5gresse@gmail.com not found.");
    console.log("   Please sign up first at /account/sign-up");
    return;
  }

  console.log("✅ User found:", user.id);

  // Find or create shop
  let shop = await prisma.shop.findFirst({
    where: { affiliationCode: "DEMO-SHOP-2024" },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        name: "My Crypto Shop",
        address: "42 Rue de la Blockchain, Paris",
        affiliationCode: "DEMO-SHOP-2024",
        commissionRate: 0.15,
        isActive: true,
        userId: user.id,
      },
    });
    console.log("✅ Shop created:", shop.id);
  } else {
    // Link shop to user
    shop = await prisma.shop.update({
      where: { id: shop.id },
      data: { userId: user.id },
    });
    console.log("✅ Shop linked to user:", shop.id);
  }

  // Find or create wallet provider
  let walletProvider = await prisma.walletProvider.findFirst({
    where: { apiKey: "demo-wallet-provider" },
  });

  if (!walletProvider) {
    walletProvider = await prisma.walletProvider.create({
      data: {
        name: "CryptoWallet Pro",
        apiKey: "demo-wallet-provider",
        isActive: true,
        cpaAmount: 50.0,
      },
    });
    console.log("✅ Wallet Provider created:", walletProvider.id);
  } else {
    console.log("✅ Wallet Provider exists:", walletProvider.id);
  }

  // Clean existing data for this shop
  await prisma.commission.deleteMany({ where: { shopId: shop.id } });
  await prisma.withdrawal.deleteMany({ where: { shopId: shop.id } });
  await prisma.invoice.deleteMany({ where: { shopId: shop.id } });
  await prisma.affiliateUser.deleteMany({ where: { shopId: shop.id } });
  console.log("🧹 Cleaned existing data for shop");

  // Create affiliate users
  const affiliates = await Promise.all([
    prisma.affiliateUser.create({
      data: {
        partnerUserId: "user_crypto_alice_2024",
        status: "ACTIVE",
        acquisitionSource: "QR",
        activatedAt: new Date("2024-12-01"),
        shopId: shop.id,
        walletProviderId: walletProvider.id,
      },
    }),
    prisma.affiliateUser.create({
      data: {
        partnerUserId: "user_crypto_bob_2024",
        status: "ACTIVE",
        acquisitionSource: "QR",
        activatedAt: new Date("2024-12-10"),
        shopId: shop.id,
        walletProviderId: walletProvider.id,
      },
    }),
    prisma.affiliateUser.create({
      data: {
        partnerUserId: "user_crypto_charlie_2024",
        status: "ACTIVE",
        acquisitionSource: "LINK",
        activatedAt: new Date("2024-12-15"),
        shopId: shop.id,
        walletProviderId: walletProvider.id,
      },
    }),
    prisma.affiliateUser.create({
      data: {
        partnerUserId: "user_crypto_diana_2024",
        status: "ACTIVE",
        acquisitionSource: "QR",
        activatedAt: new Date("2024-12-20"),
        shopId: shop.id,
        walletProviderId: walletProvider.id,
      },
    }),
    prisma.affiliateUser.create({
      data: {
        partnerUserId: "user_crypto_eve_2024",
        status: "SIGNUP",
        acquisitionSource: "QR",
        shopId: shop.id,
        walletProviderId: walletProvider.id,
      },
    }),
  ]);
  console.log("✅ Created", affiliates.length, "affiliate users");

  // Create invoices (CPA events)
  const invoices = await Promise.all([
    prisma.invoice.create({
      data: {
        externalId: "cpa_alice_001",
        eventType: "CPA",
        status: "PAID",
        grossRevenue: 50.0,
        currency: "EUR",
        amountInCurrency: 50.0,
        paidAt: new Date("2024-12-01"),
        shopId: shop.id,
        affiliateUserId: affiliates[0].id,
        walletProviderId: walletProvider.id,
      },
    }),
    prisma.invoice.create({
      data: {
        externalId: "cpa_bob_001",
        eventType: "CPA",
        status: "PAID",
        grossRevenue: 50.0,
        currency: "EUR",
        amountInCurrency: 50.0,
        paidAt: new Date("2024-12-10"),
        shopId: shop.id,
        affiliateUserId: affiliates[1].id,
        walletProviderId: walletProvider.id,
      },
    }),
    prisma.invoice.create({
      data: {
        externalId: "cpa_charlie_001",
        eventType: "CPA",
        status: "PAID",
        grossRevenue: 50.0,
        currency: "EUR",
        amountInCurrency: 50.0,
        paidAt: new Date("2024-12-15"),
        shopId: shop.id,
        affiliateUserId: affiliates[2].id,
        walletProviderId: walletProvider.id,
      },
    }),
    prisma.invoice.create({
      data: {
        externalId: "cpa_diana_001",
        eventType: "CPA",
        status: "PAID",
        grossRevenue: 50.0,
        currency: "EUR",
        amountInCurrency: 50.0,
        paidAt: new Date("2024-12-20"),
        shopId: shop.id,
        affiliateUserId: affiliates[3].id,
        walletProviderId: walletProvider.id,
      },
    }),
  ]);
  console.log("✅ Created", invoices.length, "invoices (CPA)");

  // Create commissions (derived from invoices)
  const commissions = await Promise.all([
    // Alice - PAID & disponible
    prisma.commission.create({
      data: {
        eventType: "CPA",
        status: "PAID",
        grossRevenue: 50.0,
        netRevenue: 42.5,
        platformRevenue: 7.5,
        availableAt: new Date("2024-12-08"),
        shopId: shop.id,
        walletProviderId: walletProvider.id,
        affiliateUserId: affiliates[0].id,
        invoiceId: invoices[0].id,
      },
    }),
    // Bob - PAID & disponible
    prisma.commission.create({
      data: {
        eventType: "CPA",
        status: "PAID",
        grossRevenue: 50.0,
        netRevenue: 42.5,
        platformRevenue: 7.5,
        availableAt: new Date("2024-12-17"),
        shopId: shop.id,
        walletProviderId: walletProvider.id,
        affiliateUserId: affiliates[1].id,
        invoiceId: invoices[1].id,
      },
    }),
    // Charlie - PAID & disponible
    prisma.commission.create({
      data: {
        eventType: "CPA",
        status: "PAID",
        grossRevenue: 50.0,
        netRevenue: 42.5,
        platformRevenue: 7.5,
        availableAt: new Date("2024-12-22"),
        shopId: shop.id,
        walletProviderId: walletProvider.id,
        affiliateUserId: affiliates[2].id,
        invoiceId: invoices[2].id,
      },
    }),
    // Diana - PAID & disponible
    prisma.commission.create({
      data: {
        eventType: "CPA",
        status: "PAID",
        grossRevenue: 50.0,
        netRevenue: 42.5,
        platformRevenue: 7.5,
        availableAt: new Date("2024-12-27"),
        shopId: shop.id,
        walletProviderId: walletProvider.id,
        affiliateUserId: affiliates[3].id,
        invoiceId: invoices[3].id,
      },
    }),
    // Extra commission PENDING (en attente de validation)
    prisma.commission.create({
      data: {
        eventType: "CPA",
        status: "PENDING",
        grossRevenue: 50.0,
        netRevenue: 42.5,
        platformRevenue: 7.5,
        shopId: shop.id,
        walletProviderId: walletProvider.id,
        affiliateUserId: affiliates[0].id,
      },
    }),
  ]);
  console.log("✅ Created", commissions.length, "commissions");

  // Create withdrawals
  const withdrawals = await Promise.all([
    // Withdrawal PAID
    prisma.withdrawal.create({
      data: {
        requestedAmount: 40.0,
        payoutAmount: 40.0,
        paymentType: "CRYPTO",
        destinationAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD12",
        status: "PAID",
        transactionHash: "0xabc123def456789abcdef123456789abcdef1234",
        paidAt: new Date("2024-12-10"),
        shopId: shop.id,
      },
    }),
    // Withdrawal PENDING
    prisma.withdrawal.create({
      data: {
        requestedAmount: 30.0,
        paymentType: "CRYPTO",
        destinationAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD12",
        status: "PENDING",
        shopId: shop.id,
      },
    }),
  ]);
  console.log("✅ Created", withdrawals.length, "withdrawals");

  // Summary
  const totalPaid = 42.5 * 4; // 4 commissions PAID
  const totalPending = 42.5; // 1 commission PENDING
  const withdrawalsPaid = 40.0;
  const withdrawalsPending = 30.0;
  const available = totalPaid - withdrawalsPending;

  console.log("");
  console.log("📊 Résumé Money Truth:");
  console.log("   Commissions PAID (disponibles):", totalPaid, "€");
  console.log("   Commissions PENDING:", totalPending, "€");
  console.log("   Withdrawals PAID:", withdrawalsPaid, "€");
  console.log("   Withdrawals PENDING:", withdrawalsPending, "€");
  console.log("   ─────────────────────────────");
  console.log("   Solde disponible:", available, "€");
  console.log("");
  console.log("🎉 Shop linked to", user.email);
  console.log("👉 Go to http://localhost:3001/dashboard to see your dashboard!");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

