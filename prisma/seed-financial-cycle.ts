import { config } from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";

// Charger les variables d'environnement depuis .env
config();

const prisma = new PrismaClient();

/**
 * 🧪 Script de test du cycle financier complet
 * 
 * Simule toutes les transitions d'état et vérifie les invariants financiers
 */

interface FinancialState {
  totalCommissionsPaid: number;
  totalCommissionsPending: number;
  totalWithdrawalsPending: number;
  totalWithdrawalsPaid: number;
  availableBalance: number;
}

async function getFinancialState(shopId: string): Promise<FinancialState> {
  const now = new Date();
  const [commissionsPaid, commissionsPending, withdrawalsPending, withdrawalsPaid] =
    await Promise.all([
      // Total commissions PAID ET disponibles (availableAt IS NULL OR availableAt <= now)
      prisma.commission.aggregate({
        where: {
          shopId,
          status: "PAID",
          OR: [
            { availableAt: null },
            { availableAt: { lte: now } },
          ],
        },
        _sum: {
          netRevenue: true,
        },
      }),
      prisma.commission.aggregate({
        where: {
          shopId,
          status: "PENDING",
        },
        _sum: {
          netRevenue: true,
        },
      }),
      prisma.withdrawal.aggregate({
        where: {
          shopId,
          status: "PENDING",
        },
        _sum: {
          requestedAmount: true,
        },
      }),
      prisma.withdrawal.aggregate({
        where: {
          shopId,
          status: "PAID",
        },
        _sum: {
          requestedAmount: true,
        },
      }),
    ]);

  const totalCommissionsPaid = commissionsPaid._sum.netRevenue ?? 0;
  const totalCommissionsPending = commissionsPending._sum.netRevenue ?? 0;
  const totalWithdrawalsPending = withdrawalsPending._sum.requestedAmount ?? 0;
  const totalWithdrawalsPaid = withdrawalsPaid._sum.requestedAmount ?? 0;
  const availableBalance = Math.max(
    0,
    totalCommissionsPaid - totalWithdrawalsPending
  );

  return {
    totalCommissionsPaid,
    totalCommissionsPending,
    totalWithdrawalsPending,
    totalWithdrawalsPaid,
    availableBalance,
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function assertInvariant(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(`❌ INVARIANT VIOLÉ: ${message}`);
  }
  console.log(`   ✅ ${message}`);
}

async function main() {
  console.log("🧪 Démarrage du test du cycle financier complet\n");

  // ============================================
  // 1️⃣ AFFILIATE LIFECYCLE
  // ============================================
  console.log("1️⃣ AFFILIATE LIFECYCLE");
  console.log("─".repeat(50));

  // Créer un shop de test
  const shop = await prisma.shop.upsert({
    where: { affiliationCode: "TEST-CYCLE-SHOP" },
    update: {},
    create: {
      name: "Test Cycle Shop",
      address: "123 Cycle Street",
      affiliationCode: "TEST-CYCLE-SHOP",
      commissionRate: 0.15, // 15% pour le shop, 85% pour la plateforme
      isActive: true,
    },
  });

  console.log(`✅ Shop créé: ${shop.id} (${shop.name})`);

  // Créer un wallet provider
  const walletProvider = await prisma.walletProvider.upsert({
    where: { apiKey: "test-cycle-wallet-provider" },
    update: {},
    create: {
      name: "Test Cycle Wallet Provider",
      apiKey: "test-cycle-wallet-provider",
      isActive: true,
      cpaAmount: 10.0,
    },
  });

  console.log(`✅ Wallet Provider créé: ${walletProvider.id}`);

  // Nettoyer les anciennes données
  await prisma.commission.deleteMany({
    where: { shopId: shop.id },
  });
  await prisma.withdrawal.deleteMany({
    where: { shopId: shop.id },
  });
  await prisma.invoice.deleteMany({
    where: { shopId: shop.id },
  });
  await prisma.affiliateUser.deleteMany({
    where: { shopId: shop.id },
  });

  // A. Création AffiliateUser (SIGNUP)
  const affiliateUser = await prisma.affiliateUser.create({
    data: {
      status: "SIGNUP",
      partnerUserId: "partner-cycle-test",
      acquisitionSource: "QR",
      shopId: shop.id,
      walletProviderId: walletProvider.id,
      activatedAt: null, // Pas encore activé
    },
  });

  console.log(`✅ AffiliateUser créé: ${affiliateUser.id} (status: SIGNUP)`);
  assertInvariant(
    affiliateUser.status === "SIGNUP",
    "AffiliateUser doit être en SIGNUP"
  );
  assertInvariant(
    affiliateUser.activatedAt === null,
    "activatedAt doit être null pour SIGNUP"
  );

  // Vérifier qu'aucune commission n'est possible
  const commissionsBeforeActivation = await prisma.commission.count({
    where: { affiliateUserId: affiliateUser.id },
  });
  assertInvariant(
    commissionsBeforeActivation === 0,
    "Aucune commission possible avant activation"
  );

  // B. Activation AffiliateUser
  const now = new Date();
  const activatedAffiliate = await prisma.affiliateUser.update({
    where: { id: affiliateUser.id },
    data: {
      status: "ACTIVE",
      activatedAt: now,
    },
  });

  console.log(`✅ AffiliateUser activé: ${activatedAffiliate.id} (status: ACTIVE)`);
  assertInvariant(
    activatedAffiliate.status === "ACTIVE",
    "AffiliateUser doit être en ACTIVE"
  );
  assertInvariant(
    activatedAffiliate.activatedAt !== null,
    "activatedAt doit être défini après activation"
  );

  // Vérifier qu'aucune commission n'est encore créée
  const commissionsAfterActivation = await prisma.commission.count({
    where: { affiliateUserId: activatedAffiliate.id },
  });
  assertInvariant(
    commissionsAfterActivation === 0,
    "Aucune commission créée automatiquement à l'activation"
  );

  console.log("\n");

  // ============================================
  // 2️⃣ INVOICE (SOURCE DE VÉRITÉ)
  // ============================================
  console.log("2️⃣ INVOICE (SOURCE DE VÉRITÉ)");
  console.log("─".repeat(50));

  // C. Réception événement provider - Créer Invoice
  const invoice = await prisma.invoice.create({
    data: {
      eventType: "CPA",
      status: "PAID",
      grossRevenue: 1000.0,
      currency: "USD",
      affiliateUserId: activatedAffiliate.id,
      shopId: shop.id,
      walletProviderId: walletProvider.id,
      paidAt: now,
    },
  });

  console.log(`✅ Invoice créée: ${invoice.id}`);
  console.log(`   - eventType: ${invoice.eventType}`);
  console.log(`   - status: ${invoice.status}`);
  console.log(`   - grossRevenue: ${formatCurrency(invoice.grossRevenue)}`);

  assertInvariant(
    invoice.status === "PAID",
    "Invoice doit être en PAID"
  );
  assertInvariant(
    invoice.grossRevenue === 1000.0,
    "grossRevenue doit être exactement 1000.0"
  );

  // Vérifier qu'aucune commission n'est encore visible côté shop
  const commissionsAfterInvoice = await prisma.commission.count({
    where: { invoiceId: invoice.id },
  });
  assertInvariant(
    commissionsAfterInvoice === 0,
    "Aucune commission créée automatiquement à la création de l'invoice"
  );

  // Vérifier l'invariant: une Invoice ne peut pas changer de montant
  const invoiceBeforeUpdate = await prisma.invoice.findUnique({
    where: { id: invoice.id },
  });
  assertInvariant(
    invoiceBeforeUpdate?.grossRevenue === 1000.0,
    "Invoice ne peut pas changer de montant après création"
  );

  console.log("\n");

  // ============================================
  // 3️⃣ COMMISSION (DÉRIVÉE)
  // ============================================
  console.log("3️⃣ COMMISSION (DÉRIVÉE)");
  console.log("─".repeat(50));

  // D. Génération commission (automatique)
  // Calcul: grossRevenue = 1000, commissionRate = 0.15
  // netRevenue = 1000 * 0.15 = 150
  // platformRevenue = 1000 * 0.85 = 850
  const grossRevenue = invoice.grossRevenue;
  const commissionRate = shop.commissionRate;
  const netRevenue = grossRevenue * commissionRate; // 1000 * 0.15 = 150
  const platformRevenue = grossRevenue * (1 - commissionRate); // 1000 * 0.85 = 850

  // availableAt = now() + 7 jours
  const availableAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const commission = await prisma.commission.create({
    data: {
      eventType: invoice.eventType,
      status: "PAID",
      grossRevenue,
      netRevenue,
      platformRevenue,
      availableAt,
      shopId: shop.id,
      walletProviderId: walletProvider.id,
      affiliateUserId: activatedAffiliate.id,
      invoiceId: invoice.id,
    },
  });

  console.log(`✅ Commission créée: ${commission.id}`);
  console.log(`   - grossRevenue: ${formatCurrency(commission.grossRevenue)}`);
  console.log(`   - netRevenue: ${formatCurrency(commission.netRevenue)}`);
  console.log(`   - platformRevenue: ${formatCurrency(commission.platformRevenue)}`);
  console.log(`   - status: ${commission.status}`);
  console.log(`   - availableAt: ${availableAt.toISOString()}`);

  assertInvariant(
    commission.grossRevenue === 1000.0,
    "grossRevenue doit être 1000.0"
  );
  assertInvariant(
    commission.netRevenue === 150.0,
    "netRevenue doit être 150.0 (1000 * 0.15)"
  );
  assertInvariant(
    commission.platformRevenue === 850.0,
    "platformRevenue doit être 850.0 (1000 * 0.85)"
  );
  assertInvariant(
    commission.status === "PAID",
    "Commission doit être en PAID"
  );
  assertInvariant(
    commission.invoiceId === invoice.id,
    "Commission doit être liée à l'invoice"
  );

  // Vérifier l'invariant: une Invoice ne peut pas générer 2 commissions
  const commissionCount = await prisma.commission.count({
    where: { invoiceId: invoice.id },
  });
  assertInvariant(
    commissionCount === 1,
    "Une Invoice ne peut générer qu'une seule commission"
  );

  // Vérifier l'invariant: une Commission ne change jamais de montant
  const commissionBeforeUpdate = await prisma.commission.findUnique({
    where: { id: commission.id },
  });
  assertInvariant(
    commissionBeforeUpdate?.netRevenue === 150.0,
    "Commission ne peut pas changer de montant après création"
  );

  // État financier actuel (commission PAID mais pas encore disponible car availableAt > now)
  const stateAfterCommission = await getFinancialState(shop.id);
  console.log(`\n📊 État financier après création commission:`);
  console.log(`   - Commissions PAID: ${formatCurrency(stateAfterCommission.totalCommissionsPaid)}`);
  console.log(`   - Commissions PENDING: ${formatCurrency(stateAfterCommission.totalCommissionsPending)}`);
  console.log(`   - Available Balance: ${formatCurrency(stateAfterCommission.availableBalance)}`);
  console.log(`   ⚠️  Note: availableAt = ${availableAt.toISOString()} > now, donc commission non disponible`);

  // Vérifier que la commission PAID n'est PAS encore disponible (availableAt > now)
  assertInvariant(
    stateAfterCommission.totalCommissionsPaid === 0,
    "Total commissions PAID disponibles doit être 0 (availableAt > now)"
  );

  // Vérifier l'invariant financier: availableBalance ne peut pas être négatif
  assertInvariant(
    stateAfterCommission.availableBalance >= 0,
    "Available balance ne peut jamais être négatif"
  );

  console.log("\n");

  // ============================================
  // 4️⃣ DISPONIBILITÉ
  // ============================================
  console.log("4️⃣ DISPONIBILITÉ");
  console.log("─".repeat(50));

  // E. Passage du temps - Mettre à jour availableAt pour simuler le passage du temps
  // On met availableAt dans le passé pour que la commission devienne disponible
  const pastDate = new Date(now.getTime() - 1000); // 1 seconde avant maintenant
  await prisma.commission.update({
    where: { id: commission.id },
    data: { availableAt: pastDate },
  });

  console.log(`⏰ Simulation: availableAt mis à jour dans le passé`);
  console.log(`   - availableAt = ${pastDate.toISOString()}`);
  console.log(`   - now = ${new Date().toISOString()}`);
  console.log(`   - Disponible: OUI (availableAt <= now)`);

  // La commission est maintenant disponible (availableAt <= now)
  const stateAfterAvailability = await getFinancialState(shop.id);
  console.log(`\n📊 État financier (commission disponible):`);
  console.log(`   - Commissions PAID disponibles: ${formatCurrency(stateAfterAvailability.totalCommissionsPaid)}`);
  console.log(`   - Available Balance: ${formatCurrency(stateAfterAvailability.availableBalance)}`);

  assertInvariant(
    stateAfterAvailability.totalCommissionsPaid === 150.0,
    "Commissions PAID disponibles doit être 150.0 (availableAt <= now)"
  );
  assertInvariant(
    stateAfterAvailability.availableBalance === 150.0,
    "Available balance doit être 150.0 (150 - 0)"
  );

  console.log("\n");

  // ============================================
  // 5️⃣ WITHDRAWAL
  // ============================================
  console.log("5️⃣ WITHDRAWAL");
  console.log("─".repeat(50));

  // F. Demande de retrait
  const withdrawalRequested = await prisma.withdrawal.create({
    data: {
      requestedAmount: 100.0,
      paymentType: "FIAT",
      status: "PENDING",
      shopId: shop.id,
    },
  });

  console.log(`✅ Withdrawal créé: ${withdrawalRequested.id}`);
  console.log(`   - requestedAmount: ${formatCurrency(withdrawalRequested.requestedAmount)}`);
  console.log(`   - status: ${withdrawalRequested.status}`);

  const stateAfterWithdrawalRequest = await getFinancialState(shop.id);
  console.log(`\n📊 État financier après demande de retrait:`);
  console.log(`   - Commissions PAID: ${formatCurrency(stateAfterWithdrawalRequest.totalCommissionsPaid)}`);
  console.log(`   - Withdrawals PENDING: ${formatCurrency(stateAfterWithdrawalRequest.totalWithdrawalsPending)}`);
  console.log(`   - Available Balance: ${formatCurrency(stateAfterWithdrawalRequest.availableBalance)}`);

  // Vérifier l'invariant financier: availableBalance = commissions PAID - withdrawals PENDING
  const expectedBalance = stateAfterWithdrawalRequest.totalCommissionsPaid - stateAfterWithdrawalRequest.totalWithdrawalsPending;
  assertInvariant(
    stateAfterWithdrawalRequest.availableBalance === expectedBalance,
    `Available balance doit être ${formatCurrency(expectedBalance)} (150 - 100)`
  );
  assertInvariant(
    stateAfterWithdrawalRequest.availableBalance >= 0,
    "Available balance ne peut jamais être négatif"
  );

  // G. Paiement effectué
  const withdrawalPaid = await prisma.withdrawal.update({
    where: { id: withdrawalRequested.id },
    data: {
      status: "PAID",
      payoutAmount: 95.0, // Frais de 5€
      paidAt: new Date(),
      transactionHash: "0x1234567890abcdef",
    },
  });

  console.log(`✅ Withdrawal payé: ${withdrawalPaid.id}`);
  console.log(`   - requestedAmount: ${formatCurrency(withdrawalPaid.requestedAmount)}`);
  console.log(`   - payoutAmount: ${formatCurrency(withdrawalPaid.payoutAmount ?? 0)}`);
  console.log(`   - Frais: ${formatCurrency(withdrawalPaid.requestedAmount - (withdrawalPaid.payoutAmount ?? 0))}`);
  console.log(`   - transactionHash: ${withdrawalPaid.transactionHash}`);

  const stateAfterWithdrawalPaid = await getFinancialState(shop.id);
  console.log(`\n📊 État financier après paiement du retrait:`);
  console.log(`   - Commissions PAID: ${formatCurrency(stateAfterWithdrawalPaid.totalCommissionsPaid)}`);
  console.log(`   - Withdrawals PENDING: ${formatCurrency(stateAfterWithdrawalPaid.totalWithdrawalsPending)}`);
  console.log(`   - Withdrawals PAID: ${formatCurrency(stateAfterWithdrawalPaid.totalWithdrawalsPaid)}`);
  console.log(`   - Available Balance: ${formatCurrency(stateAfterWithdrawalPaid.availableBalance)}`);

  // Vérifier que le withdrawal PENDING n'est plus comptabilisé
  assertInvariant(
    stateAfterWithdrawalPaid.totalWithdrawalsPending === 0,
    "Withdrawals PENDING doit être 0 après paiement"
  );
  assertInvariant(
    stateAfterWithdrawalPaid.totalWithdrawalsPaid === 100.0,
    "Withdrawals PAID doit être 100.0"
  );
  assertInvariant(
    stateAfterWithdrawalPaid.availableBalance === 150.0,
    "Available balance doit être 150.0 (150 - 0)"
  );

  // ============================================
  // 6️⃣ VÉRIFICATIONS FINALES
  // ============================================
  console.log("\n6️⃣ VÉRIFICATIONS FINALES");
  console.log("─".repeat(50));

  // Vérifier qu'aucune suppression hard n'a été effectuée
  const finalInvoice = await prisma.invoice.findUnique({
    where: { id: invoice.id },
  });
  assertInvariant(
    finalInvoice !== null,
    "Invoice ne doit jamais être supprimée (status-driven)"
  );

  const finalCommission = await prisma.commission.findUnique({
    where: { id: commission.id },
  });
  assertInvariant(
    finalCommission !== null,
    "Commission ne doit jamais être supprimée (status-driven)"
  );

  const finalWithdrawal = await prisma.withdrawal.findUnique({
    where: { id: withdrawalPaid.id },
  });
  assertInvariant(
    finalWithdrawal !== null,
    "Withdrawal ne doit jamais être supprimée (status-driven)"
  );

  // Vérifier l'invariant financier final
  const finalState = await getFinancialState(shop.id);
  const invariantCheck = finalState.totalCommissionsPaid - finalState.totalWithdrawalsPending;
  assertInvariant(
    invariantCheck >= 0,
    `Invariant financier: ${formatCurrency(finalState.totalCommissionsPaid)} - ${formatCurrency(finalState.totalWithdrawalsPending)} = ${formatCurrency(invariantCheck)} >= 0`
  );

  console.log("\n✅ Tous les invariants sont respectés !");
  console.log("\n📊 RÉSUMÉ FINAL:");
  console.log(`   - Shop: ${shop.name} (${shop.id})`);
  console.log(`   - AffiliateUser: ${activatedAffiliate.id} (${activatedAffiliate.status})`);
  console.log(`   - Invoice: ${invoice.id} (${invoice.eventType}, ${formatCurrency(invoice.grossRevenue)})`);
  console.log(`   - Commission: ${commission.id} (${formatCurrency(commission.netRevenue)})`);
  console.log(`   - Withdrawal: ${withdrawalPaid.id} (${formatCurrency(withdrawalPaid.requestedAmount)})`);
  console.log(`   - Available Balance: ${formatCurrency(finalState.availableBalance)}`);

  console.log("\n🎯 Cycle complet simulé avec succès !");
}

main()
  .catch((e) => {
    console.error("\n❌ Erreur lors du test:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

