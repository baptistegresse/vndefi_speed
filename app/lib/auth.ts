import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async sendResetPassword(_data, _request) {
      // Send an email to the user with a link to reset their password
    },
  },
});