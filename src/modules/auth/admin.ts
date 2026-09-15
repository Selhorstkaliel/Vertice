import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser, requireOnboardedUser } from "./session";

/**
 * Admins curate the shared question bank (import official exams, review and
 * publish questions). Everyone else gets a 404, so the area is not advertised.
 */
export async function requireAdmin() {
  const user = await requireOnboardedUser();
  if (!user.isAdmin) notFound();
  return user;
}

/** For route handlers: the admin, or null. */
export async function getAdmin() {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}
