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
