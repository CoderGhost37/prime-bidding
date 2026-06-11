"use server"

import { signIn, signOut } from "@/auth"

export async function loginAction(formData: FormData) {
  await signIn("credentials", {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    redirectTo: "/dashboard",
  })
}

export async function registerAction(formData: FormData) {
  const { prisma } = await import("@/lib/db")
  const bcrypt = await import("bcryptjs")

  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new Error("Email already exists")

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.user.create({
    data: { name, email, password: hashedPassword, role: "USER" },
  })

  await signIn("credentials", { email, password, redirectTo: "/dashboard" })
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" })
}
