import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard | Prime Bidding",
  description: "View active tenders, place bids, and track your bidding activity on Prime Bidding.",
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const userId = session.user.id

  const activeBids = await prisma.bid.findMany({
    where: { status: "ACTIVE" },
    orderBy: { endTime: "asc" },
    include: {
      bidCalls: {
        orderBy: { amount: "asc" }, // Changed to asc for lowest bid wins
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
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Welcome back, {session.user.name}!</p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Active Tenders</h2>
          <Badge variant="outline" className="text-base px-3 py-1">
            {activeBids.length} Available
          </Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeBids.map((bid) => {
            const lowestBid = bid.bidCalls[0]
            const timeLeft = new Date(bid.endTime).getTime() - Date.now()
            const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24))
            const hoursLeft = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

            return (
              <Link key={bid.id} href={`/bids/${bid.id}`}>
                <Card className="h-full transition-all hover:shadow-lg hover:scale-[1.02] hover:border-primary">
                  <CardHeader>
                    <CardTitle className="line-clamp-1">{bid.title}</CardTitle>
                    <CardDescription className="line-clamp-2">{bid.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">Lowest Bid</span>
                      <span className="text-2xl font-bold text-primary">
                        ₹{lowestBid ? lowestBid.amount : bid.startingAmount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total Bids</span>
                      <span className="font-semibold">{bid._count.bidCalls}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Time Left</span>
                        <span className="font-semibold text-orange-600">
                          {daysLeft > 0 ? `${daysLeft}d ${hoursLeft}h` : `${hoursLeft}h`}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
        {activeBids.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground text-center">
                No active tenders right now. Check back soon!
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">My Recent Bids</h2>
        <div className="space-y-3">
          {myBidCalls.map((call) => (
            <Card key={call.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="space-y-1">
                  <p className="font-semibold">{call.bid.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {call.createdAt.toLocaleString()} • {call.bid.status}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary">₹{call.amount}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {myBidCalls.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground text-center">
                  You haven&apos;t placed any bids yet. Browse active tenders above to get started!
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  )
}
