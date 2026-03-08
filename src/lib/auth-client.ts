import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // No baseURL — uses current window origin so it works on any host/IP
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
} = authClient;
