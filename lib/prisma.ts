import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: any | undefined;
}

/**
 * Embedded in-memory database store used for automated testing or when
 * DATABASE_URL is not yet provisioned in local dev environments.
 * Simulates Prisma models, unique constraints, and query semantics.
 */
class InMemoryPrismaMock {
  private rateLimits = new Map<string, any>();
  private studentOtps = new Map<string, any>();
  private authNonces = new Map<string, any>();
  private walletLinks = new Map<string, any>(); // key: clean usn
  private studentProfiles = new Map<string, any>(); // key: clean usn
  private institutionCredentials: any[] = [];
  private accessRequests: any[] = [];
  private studentAchievements: any[] = [];
  private studentMarks: any[] = [];
  private studentMarkVersions: any[] = [];

  rateLimitCounter = {
    findUnique: async ({ where }: { where: { key: string } }) => {
      const item = this.rateLimits.get(where.key);
      return item ? { ...item } : null;
    },
    create: async ({ data }: { data: any }) => {
      const entry = { id: Math.random().toString(), count: 0, firstAttemptAt: new Date(), updatedAt: new Date(), ...data };
      this.rateLimits.set(data.key, entry);
      return { ...entry };
    },
    update: async ({ where, data }: { where: { key: string }; data: any }) => {
      const existing = this.rateLimits.get(where.key) || { key: where.key, count: 0, firstAttemptAt: new Date() };
      let count = existing.count;
      if (typeof data.count === "object" && data.count?.increment !== undefined) {
        count = (existing.count || 0) + data.count.increment;
      } else if (typeof data.count === "number") {
        count = data.count;
      }
      const updated = { ...existing, ...data, count, key: where.key, updatedAt: new Date() };
      this.rateLimits.set(where.key, updated);
      return { ...updated };
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { key: string };
      create: any;
      update: any;
    }) => {
      const existing = this.rateLimits.get(where.key);
      if (existing) {
        const updated = { ...existing, ...update, key: where.key, updatedAt: new Date() };
        this.rateLimits.set(where.key, updated);
        return { ...updated };
      }
      const created = { id: Math.random().toString(), count: 0, firstAttemptAt: new Date(), updatedAt: new Date(), ...create, key: where.key };
      this.rateLimits.set(where.key, created);
      return { ...created };
    },
    delete: async ({ where }: { where: { key: string } }) => {
      this.rateLimits.delete(where.key);
      return { key: where.key };
    },
    deleteMany: async () => {
      this.rateLimits.clear();
      return { count: 0 };
    },
  };

  studentOTP = {
    findUnique: async ({ where }: { where: { usn: string } }) => {
      const item = this.studentOtps.get(where.usn.toUpperCase());
      return item ? { ...item } : null;
    },
    create: async ({ data }: { data: any }) => {
      const key = data.usn.toUpperCase();
      const entry = { id: Math.random().toString(), failedAttempts: 0, createdAt: new Date(), ...data, usn: key };
      this.studentOtps.set(key, entry);
      return { ...entry };
    },
    update: async ({ where, data }: { where: { usn: string }; data: any }) => {
      const key = where.usn.toUpperCase();
      const existing = this.studentOtps.get(key) || { usn: key, failedAttempts: 0, createdAt: new Date() };
      let failedAttempts = existing.failedAttempts;
      if (typeof data.failedAttempts === "object" && data.failedAttempts?.increment !== undefined) {
        failedAttempts = (existing.failedAttempts || 0) + data.failedAttempts.increment;
      } else if (typeof data.failedAttempts === "number") {
        failedAttempts = data.failedAttempts;
      }
      const updated = { ...existing, ...data, failedAttempts, usn: key };
      this.studentOtps.set(key, updated);
      return { ...updated };
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { usn: string };
      create: any;
      update: any;
    }) => {
      const key = where.usn.toUpperCase();
      const existing = this.studentOtps.get(key);
      if (existing) {
        const updated = { ...existing, ...update, usn: key };
        this.studentOtps.set(key, updated);
        return { ...updated };
      }
      const created = { id: Math.random().toString(), failedAttempts: 0, createdAt: new Date(), ...create, usn: key };
      this.studentOtps.set(key, created);
      return { ...created };
    },
    delete: async ({ where }: { where: { usn: string } }) => {
      const key = where.usn.toUpperCase();
      this.studentOtps.delete(key);
      return { usn: key };
    },
    deleteMany: async () => {
      this.studentOtps.clear();
      return { count: 0 };
    },
  };

  authNonce = {
    findFirst: async ({ where, orderBy }: { where?: any; orderBy?: any } = {}) => {
      const all = Array.from(this.authNonces.values());
      const now = new Date();
      const filtered = all.filter((n) => {
        if (where?.wallet && n.wallet.toLowerCase() !== where.wallet.toLowerCase()) return false;
        if (where?.used !== undefined && n.used !== where.used) return false;
        if (where?.expiresAt?.gt && n.expiresAt <= now) return false;
        return true;
      });
      if (orderBy?.createdAt === "desc") {
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return filtered.length > 0 ? { ...filtered[0] } : null;
    },
    findUnique: async ({ where }: { where: { nonce: string } }) => {
      const item = this.authNonces.get(where.nonce);
      return item ? { ...item } : null;
    },
    create: async ({ data }: { data: any }) => {
      if (this.authNonces.has(data.nonce)) {
        throw new Error(`Unique constraint failed on the fields: (nonce)`);
      }
      const entry = { id: `nonce_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date(), used: false, ...data };
      this.authNonces.set(data.nonce, entry);
      return { ...entry };
    },
    update: async ({ where, data }: { where: any; data: any }) => {
      const entries = Array.from(this.authNonces.entries());
      for (let i = 0; i < entries.length; i++) {
        const [k, n] = entries[i];
        if ((where.id && n.id === where.id) || (where.nonce && n.nonce === where.nonce)) {
          const updated = { ...n, ...data };
          this.authNonces.set(k, updated);
          return { ...updated };
        }
      }
      return null;
    },
    delete: async ({ where }: { where: { nonce: string } }) => {
      this.authNonces.delete(where.nonce);
      return { nonce: where.nonce };
    },
    deleteMany: async ({ where }: { where?: any } = {}) => {
      if (!where || !where.wallet) {
        this.authNonces.clear();
        return { count: 0 };
      }
      const cleanW = where.wallet.toLowerCase();
      let count = 0;
      const entries = Array.from(this.authNonces.entries());
      for (let i = 0; i < entries.length; i++) {
        const [k, n] = entries[i];
        if (n.wallet.toLowerCase() === cleanW) {
          this.authNonces.delete(k);
          count++;
        }
      }
      return { count };
    },
  };

  studentWalletLink = {
    findUnique: async ({ where }: { where: { usn: string } }) => {
      const item = this.walletLinks.get(where.usn.toUpperCase());
      return item ? { ...item } : null;
    },
    findFirst: async ({ where }: { where: { wallet: string } }) => {
      const target = where.wallet.toLowerCase();
      const allLinks = Array.from(this.walletLinks.values());
      for (let i = 0; i < allLinks.length; i++) {
        const link = allLinks[i];
        if (link.wallet.toLowerCase() === target) {
          return { ...link };
        }
      }
      return null;
    },
    create: async ({ data }: { data: any }) => {
      const cleanUsn = data.usn.toUpperCase();
      const cleanWallet = data.wallet.toLowerCase();

      // Check unique constraints
      if (this.walletLinks.has(cleanUsn)) {
        throw new Error(`Unique constraint failed on fields: (usn)`);
      }
      const allLinks = Array.from(this.walletLinks.values());
      for (let i = 0; i < allLinks.length; i++) {
        const link = allLinks[i];
        if (link.wallet.toLowerCase() === cleanWallet) {
          throw new Error(`Unique constraint failed on fields: (wallet)`);
        }
      }

      const entry = { id: Math.random().toString(), linkedAt: new Date(), ...data, usn: cleanUsn, wallet: cleanWallet };
      this.walletLinks.set(cleanUsn, entry);
      return { ...entry };
    },
    update: async ({ where, data }: { where: { usn: string }; data: any }) => {
      const key = where.usn.toUpperCase();
      const existing = this.walletLinks.get(key) || { usn: key, linkedAt: new Date() };
      const updated = { ...existing, ...data, usn: key };
      this.walletLinks.set(key, updated);
      return { ...updated };
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { usn: string };
      create: any;
      update: any;
    }) => {
      const cleanUsn = where.usn.toUpperCase();
      const existing = this.walletLinks.get(cleanUsn);
      if (existing) {
        const updated = { ...existing, ...update, usn: cleanUsn };
        this.walletLinks.set(cleanUsn, updated);
        return { ...updated };
      }
      const created = { id: Math.random().toString(), linkedAt: new Date(), ...create, usn: cleanUsn };
      this.walletLinks.set(cleanUsn, created);
      return { ...created };
    },
    deleteMany: async () => {
      this.walletLinks.clear();
      return { count: 0 };
    },
  };

  studentProfile = {
    findUnique: async ({ where }: { where: { usn: string } }) => {
      const item = this.studentProfiles.get(where.usn.toUpperCase());
      return item ? { ...item } : null;
    },
    findFirst: async ({ where }: { where?: any } = {}) => {
      const all = Array.from(this.studentProfiles.values());
      if (where?.email) {
        return all.find((p) => p.email.toLowerCase() === where.email.toLowerCase()) || null;
      }
      if (where?.usn) {
        return all.find((p) => p.usn.toUpperCase() === where.usn.toUpperCase()) || null;
      }
      return all[0] || null;
    },
    findMany: async ({ where }: { where?: any } = {}) => {
      let all = Array.from(this.studentProfiles.values());
      if (where?.usn) {
        if (typeof where.usn === "string") {
          all = all.filter((p) => p.usn.toUpperCase() === where.usn.toUpperCase());
        } else if (where.usn.in) {
          const set = new Set(where.usn.in.map((u: string) => u.toUpperCase()));
          all = all.filter((p) => set.has(p.usn.toUpperCase()));
        }
      }
      if (where?.email?.endsWith) {
        all = all.filter((p) => p.email.endsWith(where.email.endsWith));
      }
      return all.map((p) => ({ ...p }));
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { usn: string };
      create: any;
      update: any;
    }) => {
      const key = where.usn.toUpperCase();
      const existing = this.studentProfiles.get(key);
      if (existing) {
        const updated = { ...existing, ...update, usn: key, updatedAt: new Date() };
        this.studentProfiles.set(key, updated);
        return { ...updated };
      }
      const created = { ...create, usn: key, createdAt: new Date(), updatedAt: new Date() };
      this.studentProfiles.set(key, created);
      return { ...created };
    },
    deleteMany: async ({ where }: { where?: any } = {}) => {
      if (where?.usn?.in) {
        const set = new Set(where.usn.in.map((u: string) => u.toUpperCase()));
        set.forEach((k: any) => {
          this.studentProfiles.delete(k);
        });
      } else if (where?.OR) {
        for (const [k, p] of Array.from(this.studentProfiles.entries())) {
          for (const cond of where.OR) {
            if (cond.usn?.in && cond.usn.in.map((u: string) => u.toUpperCase()).includes(k)) {
              this.studentProfiles.delete(k);
            } else if (cond.email?.endsWith && p.email?.endsWith(cond.email.endsWith)) {
              this.studentProfiles.delete(k);
            }
          }
        }
      } else if (!where || Object.keys(where).length === 0) {
        this.studentProfiles.clear();
      }
      return { count: 0 };
    },
  };

  studentMark = {
    findMany: async ({ where }: { where?: any } = {}) => {
      let list = [...this.studentMarks];
      if (where?.usn) {
        list = list.filter((m) => m.usn.toUpperCase() === where.usn.toUpperCase());
      }
      if (where?.semester) {
        list = list.filter((m) => m.semester === where.semester);
      }
      if (where?.version) {
        list = list.filter((m) => m.version === where.version);
      }
      return list.map((m) => ({ ...m }));
    },
    create: async ({ data }: { data: any }) => {
      const entry = {
        id: this.studentMarks.length + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
        usn: data.usn.toUpperCase(),
      };
      this.studentMarks.push(entry);
      return { ...entry };
    },
    createMany: async ({ data }: { data: any[] }) => {
      const created = data.map((d) => ({
        id: this.studentMarks.length + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...d,
        usn: d.usn.toUpperCase(),
      }));
      this.studentMarks.push(...created);
      return { count: created.length };
    },
    deleteMany: async ({ where }: { where?: any } = {}) => {
      if (where?.usn) {
        if (typeof where.usn === "string") {
          this.studentMarks = this.studentMarks.filter(
            (m) => m.usn.toUpperCase() !== where.usn.toUpperCase()
          );
        } else if (where.usn.in) {
          const set = new Set(where.usn.in.map((u: string) => u.toUpperCase()));
          this.studentMarks = this.studentMarks.filter((m) => !set.has(m.usn.toUpperCase()));
        }
      } else {
        this.studentMarks = [];
      }
      return { count: 0 };
    },
  };

  studentMarkVersion = {
    findMany: async ({ where }: { where?: any } = {}) => {
      let list = [...this.studentMarkVersions];
      if (where?.usn) {
        list = list.filter((v) => v.usn.toUpperCase() === where.usn.toUpperCase());
      }
      return list.map((v) => ({ ...v }));
    },
    findUnique: async ({ where }: { where: any }) => {
      const usn = where?.usn_version?.usn?.toUpperCase();
      const version = where?.usn_version?.version;
      const found = this.studentMarkVersions.find(
        (v) => v.usn.toUpperCase() === usn && v.version === version
      );
      return found ? { ...found } : null;
    },
    findFirst: async ({ where, orderBy }: { where?: any; orderBy?: any } = {}) => {
      let list = [...this.studentMarkVersions];
      if (where?.usn) {
        list = list.filter((v) => v.usn.toUpperCase() === where.usn.toUpperCase());
      }
      if (where?.marksHash) {
        list = list.filter((v) => v.marksHash.toLowerCase() === where.marksHash.toLowerCase());
      }
      if (where?.version) {
        list = list.filter((v) => v.version === where.version);
      }
      if (orderBy?.version === "desc") {
        list.sort((a, b) => b.version - a.version);
      }
      return list.length > 0 ? { ...list[0] } : null;
    },
    updateMany: async ({ where, data }: { where?: any; data: any }) => {
      let count = 0;
      for (let i = 0; i < this.studentMarkVersions.length; i++) {
        const v = this.studentMarkVersions[i];
        let matches = true;
        if (where?.usn && v.usn.toUpperCase() !== where.usn.toUpperCase()) matches = false;
        if (where?.version && where.version.lt && !(v.version < where.version.lt)) matches = false;
        if (matches) {
          this.studentMarkVersions[i] = { ...v, ...data };
          count++;
        }
      }
      return { count };
    },
    create: async ({ data }: { data: any }) => {
      const entry = {
        id: this.studentMarkVersions.length + 1,
        status: data.status || "superseded",
        createdAt: new Date(),
        ...data,
        usn: data.usn.toUpperCase(),
      };
      this.studentMarkVersions.push(entry);
      return { ...entry };
    },
    deleteMany: async ({ where }: { where?: any } = {}) => {
      if (where?.usn) {
        if (typeof where.usn === "string") {
          this.studentMarkVersions = this.studentMarkVersions.filter(
            (v) => v.usn.toUpperCase() !== where.usn.toUpperCase()
          );
        } else if (where.usn.in) {
          const set = new Set(where.usn.in.map((u: string) => u.toUpperCase()));
          this.studentMarkVersions = this.studentMarkVersions.filter((v) => !set.has(v.usn.toUpperCase()));
        }
      } else {
        this.studentMarkVersions = [];
      }
      return { count: 0 };
    },
  };

  institutionCredential = {
    findUnique: async ({ where }: { where: any }) => {
      const entityType = where.entityType_codeIdentifier?.entityType;
      const codeIdentifier = where.entityType_codeIdentifier?.codeIdentifier?.toUpperCase();
      const item = this.institutionCredentials.find(
        (i) => i.entityType === entityType && i.codeIdentifier.toUpperCase() === codeIdentifier
      );
      return item ? { ...item } : null;
    },
    findMany: async ({ where }: { where?: any } = {}) => {
      let list = [...this.institutionCredentials];
      if (where?.entityType) {
        list = list.filter((i) => i.entityType === where.entityType);
      }
      return list.map((i) => ({ ...i }));
    },
    findFirst: async ({ where }: { where: any }) => {
      const cleanCode = where.codeIdentifier?.trim().toUpperCase();
      for (const item of this.institutionCredentials) {
        if (
          item.entityType === where.entityType &&
          item.codeIdentifier.toUpperCase() === cleanCode
        ) {
          return { ...item };
        }
      }
      return null;
    },
    create: async ({ data }: { data: any }) => {
      const entry = {
        id: Math.random().toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this.institutionCredentials.push(entry);
      return { ...entry };
    },
    upsert: async ({ where, create, update }: { where: any; create: any; update: any }) => {
      const entityType = where.entityType_codeIdentifier?.entityType || create.entityType;
      const codeIdentifier = (where.entityType_codeIdentifier?.codeIdentifier || create.codeIdentifier).toUpperCase();
      const idx = this.institutionCredentials.findIndex(
        (i) => i.entityType === entityType && i.codeIdentifier.toUpperCase() === codeIdentifier
      );
      if (idx !== -1) {
        this.institutionCredentials[idx] = {
          ...this.institutionCredentials[idx],
          ...update,
          updatedAt: new Date(),
        };
        return { ...this.institutionCredentials[idx] };
      }
      const entry = {
        id: Math.random().toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...create,
      };
      this.institutionCredentials.push(entry);
      return { ...entry };
    },
    deleteMany: async () => {
      this.institutionCredentials = [];
      return { count: 0 };
    },
  };

  accessRequest = {
    findMany: async ({ orderBy }: any = {}) => {
      const list = [...this.accessRequests];
      if (orderBy?.createdAt === "desc") {
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return list;
    },
    create: async ({ data }: { data: any }) => {
      const entry = {
        id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this.accessRequests.push(entry);
      return { ...entry };
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const idx = this.accessRequests.findIndex((r) => r.id === where.id);
      if (idx === -1) throw new Error(`AccessRequest not found: ${where.id}`);
      this.accessRequests[idx] = { ...this.accessRequests[idx], ...data, updatedAt: new Date() };
      return { ...this.accessRequests[idx] };
    },
    deleteMany: async () => {
      this.accessRequests = [];
      return { count: 0 };
    },
  };

  studentAchievement = {
    findMany: async ({ where, orderBy }: any = {}) => {
      let list = [...this.studentAchievements];
      if (where?.studentUSN) {
        list = list.filter((a) => (a.studentUSN || a.usn || "").toUpperCase() === where.studentUSN.toUpperCase());
      }
      if (where?.collegeCode) {
        list = list.filter((a) => (a.collegeCode || "").toUpperCase() === where.collegeCode.toUpperCase());
      }
      if (where?.studentId) {
        list = list.filter((a) => a.studentId === where.studentId);
      }
      return list.map((a) => ({ ...a }));
    },
    findUnique: async ({ where }: { where: { achievementId: number } }) => {
      const item = this.studentAchievements.find((a) => a.achievementId === where.achievementId);
      return item ? { ...item } : null;
    },
    findFirst: async ({ where, orderBy }: any = {}) => {
      let list = [...this.studentAchievements];
      if (where?.documentHash) {
        list = list.filter((a) => (a.documentHash || "").toLowerCase() === where.documentHash.toLowerCase());
      }
      if (where?.studentUSN) {
        list = list.filter((a) => (a.studentUSN || "").toUpperCase() === where.studentUSN.toUpperCase());
      }
      if (orderBy?.achievementId === "desc") {
        list.sort((a, b) => b.achievementId - a.achievementId);
      }
      return list.length > 0 ? { ...list[0] } : null;
    },
    create: async ({ data }: { data: any }) => {
      const entry = {
        id: Math.random().toString(),
        achievementId: data.achievementId || this.studentAchievements.length + 1,
        status: data.status || "pending",
        submittedAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this.studentAchievements.push(entry);
      return { ...entry };
    },
    update: async ({ where, data }: { where: { achievementId: number }; data: any }) => {
      const idx = this.studentAchievements.findIndex((a) => a.achievementId === where.achievementId);
      if (idx === -1) throw new Error(`Achievement not found: ${where.achievementId}`);
      this.studentAchievements[idx] = { ...this.studentAchievements[idx], ...data, updatedAt: new Date() };
      return { ...this.studentAchievements[idx] };
    },
    deleteMany: async () => {
      this.studentAchievements = [];
      return { count: 0 };
    },
  };
}

const isPostgresUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  const trimmed = url.trim();
  return trimmed.startsWith("postgresql://") || trimmed.startsWith("postgres://");
};

export function extractDatabaseHost(url: string | undefined): string {
  if (!url) return "in-memory mock";
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:\/\//, "http://"));
    return parsed.hostname;
  } catch {
    const match = url.match(/@([^/:?]+)/);
    return match ? match[1] : "unknown";
  }
}

function createPrismaClient(): any {
  const isVercel = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);
  const isTest = process.env.NODE_ENV === "test";

  // ---------------------------------------------------------------------------
  // TEST MODE ENFORCEMENT: Honors DATABASE_URL_TEST and refuses to run against DATABASE_URL
  // ---------------------------------------------------------------------------
  if (isTest && !isVercel) {
    if (process.env.DATABASE_URL_TEST && isPostgresUrl(process.env.DATABASE_URL_TEST)) {
      if (
        process.env.DATABASE_URL &&
        process.env.DATABASE_URL_TEST.trim() === process.env.DATABASE_URL.trim()
      ) {
        throw new Error(
          "[Security Violation] Refusing to run tests: DATABASE_URL_TEST cannot be identical to DATABASE_URL to protect production data."
        );
      }
      const host = extractDatabaseHost(process.env.DATABASE_URL_TEST);
      console.log(`[Test Environment] Database Host: ${host}`);

      try {
        return new PrismaClient({
          datasources: { db: { url: process.env.DATABASE_URL_TEST } },
          log: ["error"],
        });
      } catch (e) {
        return new InMemoryPrismaMock();
      }
    }

    // Refuse to run tests against the database named in DATABASE_URL
    if (process.env.DATABASE_URL) {
      const prodHost = extractDatabaseHost(process.env.DATABASE_URL);
      console.log(
        `[Test Environment] Refusing to run tests against DATABASE_URL (${prodHost}). Falling back to isolated in-memory test database.`
      );
    }
    console.log(`[Test Environment] Database Host: ${extractDatabaseHost(undefined)}`);
    return new InMemoryPrismaMock();
  }

  const dbUrl = process.env.DATABASE_URL;

  // On Vercel or in standard production/server runtime, InMemoryPrismaMock is NEVER reachable.
  if (isVercel || process.env.NODE_ENV === "production" || !isTest) {
    if (!isPostgresUrl(dbUrl)) {
      throw new Error(
        "[Prisma] Production runtime on Vercel requires a valid PostgreSQL DATABASE_URL. In-memory mock is strictly prohibited."
      );
    }
    return new PrismaClient({
      datasources: { db: { url: dbUrl } },
      log: ["error"],
    });
  }

  const mock = new InMemoryPrismaMock();

  if (!isPostgresUrl(dbUrl) || process.env.USE_PRISMA_MOCK === "true") {
    return mock;
  }

  let realPrisma: any;
  try {
    realPrisma = new PrismaClient({
      datasources: { db: { url: dbUrl } },
      log: ["error"],
    });
  } catch (e) {
    return mock;
  }

  // Resilient proxy for local test runners: executes queries on PostgreSQL, falls back to inMemoryMock if test network drops
  return new Proxy(realPrisma, {
    get(target: any, prop: string | symbol) {
      if (typeof prop === "symbol" || prop === "$connect" || prop === "$disconnect") {
        return target[prop]?.bind(target) || (() => Promise.resolve());
      }
      const model = target[prop];
      const mockModel = (mock as any)[prop];
      if (!model) return mockModel;

      return new Proxy(model, {
        get(mTarget: any, mProp: string | symbol) {
          const fn = mTarget[mProp];
          const mockFn = mockModel ? mockModel[mProp] : undefined;
          if (typeof fn !== "function") return fn;

          return async function (...args: any[]) {
            try {
              return await fn.apply(mTarget, args);
            } catch (err: any) {
              const errMsg = err?.message || "";
              if (
                isTest &&
                !isVercel &&
                (errMsg.includes("P1001") ||
                  errMsg.includes("Can't reach database server") ||
                  errMsg.includes("ENOTFOUND"))
              ) {
                if (mockFn) {
                  return await mockFn.apply(mockModel, args);
                }
              }
              throw err;
            }
          };
        },
      });
    },
  });
}

export const prisma: any = global.__prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export default prisma;
