# E-Bidding Application — Implementation Plan

## 1. Prisma Schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  USER
  ADMIN
}

enum BidStatus {
  ACTIVE
  CLOSED
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  password      String?
  role          Role      @default(USER)
  accounts      Account[]
  sessions      Session[]
  bids          Bid[]
  bidCalls      BidCall[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

model Bid {
  id              String      @id @default(cuid())
  title           String
  description     String
  startingAmount  Float
  guardrailAmount Float
  startTime       DateTime
  endTime         DateTime
  status          BidStatus   @default(ACTIVE)
  createdById     String
  createdBy       User        @relation(fields: [createdById], references: [id])
  bidCalls        BidCall[]
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

model BidCall {
  id        String   @id @default(cuid())
  amount    Float
  bidId     String
  bid       Bid      @relation(fields: [bidId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
}
```

## 2. Prisma Client Singleton (`lib/db.ts`)

```ts
import { PrismaClient } from "./generated/prisma"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

## 3. Seed Script (`prisma/seed.ts`)

```ts
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const password = await bcrypt.hash("password123", 10)

  // Admin
  await prisma.user.upsert({
    where: { email: "admin@primebid.com" },
    update: {},
    create: {
      email: "admin@primebid.com",
      name: "Admin",
      password,
      role: "ADMIN",
    },
  })

  // Regular users
  const users = ["Alice", "Bob", "Carol", "Dave"]
  for (const name of users) {
    await prisma.user.upsert({
      where: { email: `${name.toLowerCase()}@primebid.com` },
      update: {},
      create: {
        email: `${name.toLowerCase()}@primebid.com`,
        name,
        password,
        role: "USER",
      },
    })
  }

  console.log("Seeded successfully")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

Update `package.json` scripts:
```json
"prisma": {
  "seed": "bun run prisma/seed.ts"
}
```

## 4. Auth.js Type Augmentation (`types/next-auth.d.ts`)

```ts
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    role: string
  }
  interface Session {
    user: {
      id: string
      role: string
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string
  }
}
```

## 5. Auth Config (`auth.config.ts` at root)

```ts
import type { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isAdmin = auth?.user?.role === "ADMIN"
      const pathname = nextUrl.pathname

      // Admin routes require ADMIN role
      if (pathname.startsWith("/admin")) {
        return isAdmin
      }

      // Protected routes require login
      if (pathname.startsWith("/dashboard") || pathname.startsWith("/bids")) {
        return isLoggedIn
      }

      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.role = token.role as string
      }
      return session
    },
  },
  providers: [],
}
```

## 6. Full Auth Setup (`auth.ts` at root)

```ts
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/db"
import { authConfig } from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || !user.password) return null

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password,
        )

        if (!passwordMatch) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
})
```

## 7. Proxy (`proxy.ts` at root)

```ts
import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

const { auth: proxy } = NextAuth(authConfig)

export { proxy as default }

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
```

## 8. Auth API Route (`app/api/auth/[...nextauth]/route.ts`)

```ts
import { handlers } from "@/auth"

export const { GET, POST } = handlers
```

## 9. Update Root Layout (`app/layout.tsx`)

Wrap children with `SessionProvider`:

```tsx
import { Geist, Geist_Mono, Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { SessionProvider } from "next-auth/react"

const geistHeading = Geist({ subsets: ["latin"], variable: "--font-heading" })
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable,
        geistHeading.variable,
      )}
    >
      <body>
        <SessionProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
```

## 10. Auth Pages

### Server Action (`lib/actions/auth.ts`)

```ts
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
```

### Login Page (`app/(auth)/login/page.tsx`)

```tsx
import { loginAction } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <form action={loginAction} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-bold">Sign In</h1>
        <Input name="email" type="email" placeholder="Email" required />
        <Input name="password" type="password" placeholder="Password" required />
        <Button type="submit">Sign In</Button>
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a href="/register" className="underline">
            Register
          </a>
        </p>
      </form>
    </div>
  )
}
```

### Register Page (`app/(auth)/register/page.tsx`)

```tsx
import { registerAction } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function RegisterPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <form action={registerAction} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-bold">Register</h1>
        <Input name="name" placeholder="Name" required />
        <Input name="email" type="email" placeholder="Email" required />
        <Input name="password" type="password" placeholder="Password" required />
        <Button type="submit">Register</Button>
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="underline">
            Sign In
          </a>
        </p>
      </form>
    </div>
  )
}
```

## 11. Admin Routes

### Shared Layout (`app/(admin)/layout.tsx`)

```tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") redirect("/login")

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b px-6 py-3">
        <nav className="flex items-center gap-6">
          <a href="/admin/dashboard" className="font-bold">
            Admin Dashboard
          </a>
          <a href="/admin/bids/new" className="text-sm text-muted-foreground hover:underline">
            New Bid
          </a>
          <a href="/dashboard" className="ml-auto text-sm text-muted-foreground hover:underline">
            User View
          </a>
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
```

### Admin Dashboard (`app/(admin)/dashboard/page.tsx`)

```tsx
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default async function AdminDashboardPage() {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") redirect("/login")

  const bids = await prisma.bid.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { bidCalls: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">All Bids</h1>
        <Link href="/admin/bids/new">
          <Button>Create Bid</Button>
        </Link>
      </div>

      <div className="space-y-4">
        {bids.map((bid) => (
          <Link key={bid.id} href={`/admin/bids/${bid.id}`}>
            <div className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50">
              <div>
                <h2 className="font-semibold">{bid.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {bid._count.bidCalls} bid calls &middot; Starting at ${bid.startingAmount}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  bid.status === "ACTIVE"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {bid.status}
              </span>
            </div>
          </Link>
        ))}
        {bids.length === 0 && (
          <p className="text-sm text-muted-foreground">No bids yet.</p>
        )}
      </div>
    </div>
  )
}
```

### Create Bid (`app/(admin)/bids/new/page.tsx`)

```tsx
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export default function NewBidPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-3xl font-bold">Create New Bid</h1>
      <form action={createBidAction} className="flex flex-col gap-4">
        <Input name="title" placeholder="Title" required />
        <Textarea name="description" placeholder="Description" required />
        <Input name="startingAmount" type="number" step="0.01" placeholder="Starting Amount" required />
        <Input name="guardrailAmount" type="number" step="0.01" placeholder="Guardrail Amount (reserve price)" required />
        <Input name="startTime" type="datetime-local" placeholder="Start Time" required />
        <Input name="endTime" type="datetime-local" placeholder="End Time" required />
        <Button type="submit">Create Bid</Button>
      </form>
    </div>
  )
}

async function createBidAction(formData: FormData) {
  "use server"
  const session = await auth()
  if (session?.user?.role !== "ADMIN") throw new Error("Unauthorized")

  await prisma.bid.create({
    data: {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      startingAmount: Number(formData.get("startingAmount")),
      guardrailAmount: Number(formData.get("guardrailAmount")),
      startTime: new Date(formData.get("startTime") as string),
      endTime: new Date(formData.get("endTime") as string),
      createdById: session.user.id,
    },
  })

  revalidatePath("/admin/dashboard")
  redirect("/admin/dashboard")
}
```

### Admin Bid Details (`app/(admin)/bids/[id]/page.tsx`)

```tsx
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { notFound } from "next/navigation"

export default async function AdminBidDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") redirect("/login")

  const { id } = await params
  const bid = await prisma.bid.findUnique({
    where: { id },
    include: {
      bidCalls: {
        orderBy: { amount: "desc" },
        include: { user: { select: { name: true, email: true } } },
      },
    },
  })

  if (!bid) notFound()

  const highestBid = bid.bidCalls[0]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{bid.title}</h1>
        <p className="mt-2 text-muted-foreground">{bid.description}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Starting Amount:</span> ${bid.startingAmount}
          </div>
          <div>
            <span className="text-muted-foreground">Guardrail Amount:</span> ${bid.guardrailAmount}
          </div>
          <div>
            <span className="text-muted-foreground">Status:</span> {bid.status}
          </div>
          <div>
            <span className="text-muted-foreground">Highest Bid:</span>{" "}
            {highestBid ? `$${highestBid.amount}` : "No bids"}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold">Bid Calls ({bid.bidCalls.length})</h2>
        <div className="mt-4 space-y-2">
          {bid.bidCalls.map((call) => (
            <div
              key={call.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{call.user.name}</p>
                <p className="text-xs text-muted-foreground">{call.user.email}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">${call.amount}</p>
                <p className="text-xs text-muted-foreground">
                  {call.createdAt.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
          {bid.bidCalls.length === 0 && (
            <p className="text-sm text-muted-foreground">No bid calls yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

## 12. User Routes

### User Dashboard (`app/(dashboard)/page.tsx`)

```tsx
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const userId = session.user.id

  const activeBids = await prisma.bid.findMany({
    where: { status: "ACTIVE" },
    orderBy: { endTime: "asc" },
    include: {
      bidCalls: {
        orderBy: { amount: "desc" },
        take: 1,
      },
      _count: { select: { bidCalls: true } },
    },
  })

  const myBidCalls = await prisma.bidCall.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { bid: { select: { title: true, status: true } } },
    take: 10,
  })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome, {session.user.name}</p>
      </div>

      <section>
        <h2 className="text-xl font-semibold">Active Bids</h2>
        <div className="mt-4 space-y-3">
          {activeBids.map((bid) => (
            <Link key={bid.id} href={`/bids/${bid.id}`}>
              <div className="rounded-lg border p-4 hover:bg-muted/50">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{bid.title}</h3>
                  <span className="text-lg font-bold">
                    {bid.bidCalls[0] ? `$${bid.bidCalls[0].amount}` : `$${bid.startingAmount}`}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {bid._count.bidCalls} bids &middot; Ends {bid.endTime.toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
          {activeBids.length === 0 && (
            <p className="text-sm text-muted-foreground">No active bids right now.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">My Recent Bids</h2>
        <div className="mt-4 space-y-3">
          {myBidCalls.map((call) => (
            <div key={call.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{call.bid.title}</p>
                <p className="font-bold">${call.amount}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {call.createdAt.toLocaleString()} &middot; Status: {call.bid.status}
              </p>
            </div>
          ))}
          {myBidCalls.length === 0 && (
            <p className="text-sm text-muted-foreground">You haven&apos;t placed any bids yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
```

### User Bid Detail (`app/(dashboard)/bids/[id]/page.tsx`)

```tsx
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default async function BidDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const userId = session.user.id

  const { id } = await params
  const bid = await prisma.bid.findUnique({
    where: { id },
    include: {
      bidCalls: {
        orderBy: { amount: "desc" },
        include: { user: { select: { name: true } } },
      },
    },
  })

  if (!bid) notFound()

  const myCall = bid.bidCalls.find((c) => c.userId === userId)
  const highestBid = bid.bidCalls[0]

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{bid.title}</h1>
        <p className="mt-2 text-muted-foreground">{bid.description}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Starting Amount:</span> ${bid.startingAmount}
          </div>
          <div>
            <span className="text-muted-foreground">Current Highest:</span>{" "}
            {highestBid ? `$${highestBid.amount}` : "No bids yet"}
          </div>
          <div>
            <span className="text-muted-foreground">Status:</span> {bid.status}
          </div>
          <div>
            <span className="text-muted-foreground">Ends:</span>{" "}
            {bid.endTime.toLocaleString()}
          </div>
        </div>
      </div>

      {bid.status === "ACTIVE" && (
        <form action={placeBidAction} className="flex items-end gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium">Your Bid</label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              required
              min={highestBid ? highestBid.amount + 0.01 : bid.startingAmount}
              placeholder={
                highestBid
                  ? `Min: $${highestBid.amount + 0.01}`
                  : `Min: $${bid.startingAmount}`
              }
            />
          </div>
          <input type="hidden" name="bidId" value={bid.id} />
          <Button type="submit">Place Bid</Button>
        </form>
      )}

      {myCall && (
        <p className="text-sm text-muted-foreground">
          Your current bid: ${myCall.amount}
        </p>
      )}

      <div>
        <h2 className="text-xl font-semibold">All Bids ({bid.bidCalls.length})</h2>
        <div className="mt-4 space-y-2">
          {bid.bidCalls.map((call, i) => (
            <div
              key={call.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                i === 0 ? "border-yellow-400 bg-yellow-50" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                {i === 0 && <span className="text-lg">👑</span>}
                <p className="font-medium">{call.user.name}</p>
              </div>
              <p className="font-bold">${call.amount}</p>
            </div>
          ))}
          {bid.bidCalls.length === 0 && (
            <p className="text-sm text-muted-foreground">No bids yet. Be the first!</p>
          )}
        </div>
      </div>
    </div>
  )
}

async function placeBidAction(formData: FormData) {
  "use server"
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const bidId = formData.get("bidId") as string
  const amount = Number(formData.get("amount"))
  const userId = session.user.id

  const bid = await prisma.bid.findUnique({ where: { id: bidId } })
  if (!bid || bid.status !== "ACTIVE") throw new Error("Bid is not active")

  await prisma.bidCall.create({
    data: { amount, bidId, userId },
  })

  revalidatePath(`/bids/${bidId}`)
  revalidatePath("/dashboard")
}
```

## 13. Landing Page (`app/page.tsx`)

```tsx
import { auth } from "@/auth"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default async function HomePage() {
  const session = await auth()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6 text-center">
      <h1 className="text-5xl font-bold">Prime Bidding</h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        A transparent e-bidding platform. Place your bids and win auctions.
      </p>
      <div className="mt-8 flex gap-4">
        {session?.user ? (
          <Link href="/dashboard">
            <Button>Go to Dashboard</Button>
          </Link>
        ) : (
          <>
            <Link href="/login">
              <Button>Sign In</Button>
            </Link>
            <Link href="/register">
              <Button variant="outline">Register</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
```

## 14. Environment Variables (`.env`)

```
DATABASE_URL="postgresql://user:password@localhost:5432/prime_bidding"
AUTH_SECRET="generate-with-openssl-rand-base64-32"
```

## Implementation Order

1. Write `prisma/schema.prisma`
2. Write `lib/db.ts`
3. Write `prisma/seed.ts`
4. Write `types/next-auth.d.ts`
5. Write `auth.config.ts` (root)
6. Write `auth.ts` (root)
7. Write `proxy.ts` (root)
8. Write `app/api/auth/[...nextauth]/route.ts`
9. Update `app/layout.tsx` with SessionProvider
10. Write `lib/actions/auth.ts`
11. Write `app/(auth)/login/page.tsx` and `app/(auth)/register/page.tsx`
12. Write `app/page.tsx` (landing)
13. Write `app/(admin)/layout.tsx`, dashboard, new bid, bid detail
14. Write `app/(dashboard)/layout.tsx`, dashboard, bid detail
15. Run `npx prisma migrate dev --name init`
16. Run `bun run prisma/seed.ts`
17. Run `npm run typecheck && npm run lint`
