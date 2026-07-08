import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { firstValueFrom, Observable } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const orgId: string | undefined = req.session?.orgId;
    const branchId: string | undefined = req.session?.branchId;

    if (!orgId) {
      return next.handle();
    }

    const quoteSqlLiteral = (value: string) => value.replace(/'/g, "''");

    return new Observable((subscriber) => {
      this.prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '${quoteSqlLiteral(orgId)}'`);
          if (branchId) {
            await tx.$executeRawUnsafe(`SET LOCAL "app.branch_id" = '${quoteSqlLiteral(branchId)}'`);
          }

          return await firstValueFrom(next.handle());
        })
        .then((value) => {
          subscriber.next(value);
          subscriber.complete();
        })
        .catch((error) => subscriber.error(error));
    });
  }
}
