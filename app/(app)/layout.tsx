import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { logoutAction } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  // Redirect admins to admin dashboard
  if (session.user.role === "ADMIN") redirect("/admin/dashboard")

  return (
    <div className="flex min-h-svh flex-col bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-6 px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              P
            </div>
            <span className="font-bold text-lg">Prime Bidding</span>
          </Link>
          <nav className="flex gap-6 ml-6">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Welcome, {session.user.name}
            </span>
            <form action={logoutAction}>
              <Button variant="outline" size="sm" type="submit">
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 p-6 md:p-8">{children}</main>
    </div>
  )
}
