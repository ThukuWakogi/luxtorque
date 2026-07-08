import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

export const SEED = {
  org: {
    name: "LuxTorque Demo Org",
  },
  branches: {
    nairobi: { branchCode: "NBI-001", name: "Nairobi HQ" },
    mombasa: { branchCode: "MSA-001", name: "Mombasa Branch" },
  },
  users: {
    orgOwner: {
      email: "owner@luxtorque.dev",
      name: "Demo Org Owner",
      password: "Seed_Password_1!",
      role: "ORG_ADMIN",
    },
    branchManager: {
      email: "manager@luxtorque.dev",
      name: "Demo Branch Manager",
      password: "Seed_Password_2!",
      role: "BRANCH_MANAGER",
    },
  },
} as const;

const BCRYPT_ROUNDS = 10;

async function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_ROUNDS);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed must never run in production. Exiting.");
  }

  console.log("Seeding database...");

  await prisma.$transaction([
    prisma.staffBranchAssignment.deleteMany(),
    prisma.account.deleteMany(),
    prisma.session.deleteMany(),
    prisma.verification.deleteMany(),
    prisma.user.deleteMany(),
    prisma.branch.deleteMany(),
    prisma.organisation.deleteMany(),
  ]);

  const org = await prisma.organisation.create({
    data: {
      name: SEED.org.name,
      defaultCurrency: "KES",
      defaultTaxRate: 0.16,
      billingPlan: "FREE",
    },
  });
  console.log(`  ✓ Organisation: ${org.name} (${org.id})`);

  const branchNairobi = await prisma.branch.create({
    data: {
      orgId: org.id,
      name: SEED.branches.nairobi.name,
      branchCode: SEED.branches.nairobi.branchCode,
      address: "Waiyaki Way, Westlands, Nairobi, Kenya",
      latitude: -1.2641,
      longitude: 36.8026,
      timeZone: "Africa/Nairobi",
      status: "ACTIVE",
      openingHours: {
        monday: { open: "08:00", close: "18:00" },
        tuesday: { open: "08:00", close: "18:00" },
        wednesday: { open: "08:00", close: "18:00" },
        thursday: { open: "08:00", close: "18:00" },
        friday: { open: "08:00", close: "17:00" },
        saturday: { open: "09:00", close: "13:00" },
        sunday: { open: null, close: null },
      },
    },
  });
  console.log(`  ✓ Branch: ${branchNairobi.name} (${branchNairobi.branchCode})`);

  const branchMombasa = await prisma.branch.create({
    data: {
      orgId: org.id,
      name: SEED.branches.mombasa.name,
      branchCode: SEED.branches.mombasa.branchCode,
      address: "Nyali Road, Nyali, Mombasa, Kenya",
      latitude: -4.0234,
      longitude: 39.7237,
      timeZone: "Africa/Nairobi",
      status: "ACTIVE",
      openingHours: {
        monday: { open: "08:00", close: "18:00" },
        tuesday: { open: "08:00", close: "18:00" },
        wednesday: { open: "08:00", close: "18:00" },
        thursday: { open: "08:00", close: "18:00" },
        friday: { open: "08:00", close: "17:00" },
        saturday: { open: "09:00", close: "13:00" },
        sunday: { open: null, close: null },
      },
    },
  });
  console.log(`  ✓ Branch: ${branchMombasa.name} (${branchMombasa.branchCode})`);

  const now = new Date();

  const orgOwner = await prisma.user.create({
    data: {
      name: SEED.users.orgOwner.name,
      email: SEED.users.orgOwner.email,
      emailVerified: true,
      orgId: org.id,
      role: SEED.users.orgOwner.role,
      status: "ACTIVE",
      preferredBranchId: branchNairobi.id,
      createdAt: now,
      updatedAt: now,
    },
  });
  console.log(`  ✓ User: ${orgOwner.name} (${orgOwner.role})`);

  const branchManager = await prisma.user.create({
    data: {
      name: SEED.users.branchManager.name,
      email: SEED.users.branchManager.email,
      emailVerified: true,
      orgId: org.id,
      role: SEED.users.branchManager.role,
      status: "ACTIVE",
      preferredBranchId: branchNairobi.id,
      createdAt: now,
      updatedAt: now,
    },
  });
  console.log(`  ✓ User: ${branchManager.name} (${branchManager.role})`);

  await prisma.account.create({
    data: {
      accountId: orgOwner.email,
      providerId: "credential",
      userId: orgOwner.id,
      password: await hashPassword(SEED.users.orgOwner.password),
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.account.create({
    data: {
      accountId: branchManager.email,
      providerId: "credential",
      userId: branchManager.id,
      password: await hashPassword(SEED.users.branchManager.password),
      createdAt: now,
      updatedAt: now,
    },
  });
  console.log("  ✓ Credential accounts created");

  await prisma.staffBranchAssignment.create({
    data: {
      orgId: org.id,
      userId: orgOwner.id,
      branchId: branchNairobi.id,
      role: "ORG_ADMIN",
      isHomeBranch: true,
    },
  });

  await prisma.staffBranchAssignment.create({
    data: {
      orgId: org.id,
      userId: orgOwner.id,
      branchId: branchMombasa.id,
      role: "ORG_ADMIN",
      isHomeBranch: false,
    },
  });
  console.log("  ✓ Org Owner assigned to both branches");

  await prisma.staffBranchAssignment.create({
    data: {
      orgId: org.id,
      userId: branchManager.id,
      branchId: branchNairobi.id,
      role: "BRANCH_MANAGER",
      isHomeBranch: true,
    },
  });
  console.log("  ✓ Branch Manager assigned to Nairobi HQ only (Mombasa intentionally excluded)");

  console.log("\nSeed complete:");
  console.log(`  Organisation : ${org.name}`);
  console.log(`  Branches     : ${branchNairobi.branchCode}, ${branchMombasa.branchCode}`);
  console.log(`  Org Owner    : ${orgOwner.email}`);
  console.log(`  Branch Mgr   : ${branchManager.email} (NBI-001 only)`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
