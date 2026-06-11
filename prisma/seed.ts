import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../lib/generated/prisma/client"
import bcrypt from "bcryptjs"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const password = await bcrypt.hash("123", 10)

  await prisma.user.upsert({
    where: { email: "admin@gmail.com" },
    update: {},
    create: {
      email: "admin@gmail.com",
      name: "Admin",
      password,
      role: "ADMIN",
    },
  })

  const users = ["Alice", "Bob", "Carol", "Dave"]
  for (const name of users) {
    await prisma.user.upsert({
      where: { email: `${name.toLowerCase()}@gmail.com` },
      update: {},
      create: {
        email: `${name.toLowerCase()}@gmail.com`,
        name,
        password,
        role: "USER",
      },
    })
  }

  console.log(
    "Seed complete: admin@gmail.com, alice@gmail.com, bob@gmail.com, carol@gmail.com, dave@gmail.com (password: 123)",
  )
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
