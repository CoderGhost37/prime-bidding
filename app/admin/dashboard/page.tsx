import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Admin Dashboard | Prime Bidding",
  description: "Manage all tenders, monitor bid activity, and oversee the Prime Bidding platform.",
}

export default async function AdminDashboardPage() {
  const session = await auth()
  if (session?.user?.role !== "ADMIN") redirect("/login")

  const [bids, totalBidCalls, activeBidsCount] = await Promise.all([
    prisma.bid.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { bidCalls: true } },
        bidCalls: {
          orderBy: { amount: "asc" }, // Changed to asc for lowest bid wins
          take: 1,
        },
      },
    }),
    prisma.bidCall.count(),
    prisma.bid.count({ where: { status: "ACTIVE" } }),
  ])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="mt-2 text-muted-foreground">Manage all tenders and monitor activity</p>
        </div>
        <Link href="/admin/bids/new">
          <Button size="lg" className="h-11 px-6 font-semibold">
            + Create New Tender
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Tenders</CardDescription>
            <CardTitle className="text-4xl">{bids.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active Tenders</CardDescription>
            <CardTitle className="text-4xl">{activeBidsCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Bid Calls</CardDescription>
            <CardTitle className="text-4xl">{totalBidCalls}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4">All Tenders</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bids.map((bid) => {
            const lowestBid = bid.bidCalls[0]
            return (
              <Link key={bid.id} href={`/admin/bids/${bid.id}`}>
                <Card className="h-full transition-all hover:shadow-lg hover:scale-[1.02]">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="line-clamp-1">{bid.title}</CardTitle>
                      <Badge variant={bid.status === "ACTIVE" ? "default" : "secondary"}>
                        {bid.status}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2">{bid.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Maximum Budget</span>
                      <span className="font-semibold">₹{bid.startingAmount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Lowest Bid</span>
                      <span className="font-bold text-primary">
                        {lowestBid ? `₹${lowestBid.amount}` : "No bids"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Bids</span>
                      <span className="font-semibold">{bid._count.bidCalls}</span>
                    </div>
                    <div className="pt-2 text-xs text-muted-foreground">
                      Ends {bid.endTime.toLocaleDateString()} at {bid.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
        {bids.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No tenders created yet</p>
              <Link href="/admin/bids/new">
                <Button>Create Your First Tender</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
