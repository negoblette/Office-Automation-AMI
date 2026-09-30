import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
    employeeId: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      employeeId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    role: Role;
    employeeId: string | null;
  }
}
