import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET!,
  // baseURL must match the origin making requests.
  // In dev you may access via localhost OR a network IP — trust both.
  baseURL:
  process.env.BETTER_AUTH_URL ??
  "https://olgax-jrkmkmuhn-psu-som-msc.vercel.app",
  trustedOrigins: [
  "https://olgax-jrkmkmuhn-psu-som-msc.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "CASHIER",
        input: false, // not user-settable via sign-up
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;
