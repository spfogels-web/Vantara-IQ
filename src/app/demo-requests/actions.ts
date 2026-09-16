"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaff } from "@/lib/auth";

/** Move a lead along, and record who moved it. */
export async function setDemoRequestStatus(input: {
  id: string;
  status: string;
  note?: string;
}) {
  const me = await getCurrentUser();
  if (!me || !isStaff(me.role)) return { ok: false as const, error: "Not permitted." };

  const status = ["NEW", "CONTACTED", "DEMOED", "WON", "LOST"].includes(input.status)
    ? input.status
    : "NEW";

  await prisma.demoRequest.update({
    where: { id: input.id },
    data: {
      status,
      note: (input.note ?? "").trim().slice(0, 2000),
      handledBy: me.name || me.email,
      handledAt: new Date(),
    },
  });

  revalidatePath("/demo-requests");
  return { ok: true as const };
}
