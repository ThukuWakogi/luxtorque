import { ExecutionContext } from "@nestjs/common";
import { firstValueFrom, Observable } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../prisma/prisma.service";
import { RlsContextInterceptor } from "./rls-context.interceptor";

describe("RlsContextInterceptor", () => {
  it("sets tenant context variables for requests with org and branch context", async () => {
    const prisma = {
      $transaction: vi.fn(async (cb) => cb(prisma)),
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService;

    const interceptor = new RlsContextInterceptor(prisma);
    const request = {
      session: {
        orgId: "org-123",
        branchId: "branch-456",
      },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    const next = {
      handle: () =>
        new Observable<string>((subscriber) => {
          subscriber.next("ok");
          subscriber.complete();
        }),
    };

    await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toBe("ok");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(1, "SET LOCAL \"app.org_id\" = 'org-123'");
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(2, "SET LOCAL \"app.branch_id\" = 'branch-456'");
  });
});
