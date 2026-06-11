import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Metadata } from "next"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const bid = await prisma.bid.findUnique({
    where: { id },
    select: { title: true },
  })

  return {
    title: bid ? `${bid.title} | Admin | Prime Bidding` : "Tender Details | Admin | Prime Bidding",
    description: "View detailed information about this tender including all bids and distributor activity.",
  }
}

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
        orderBy: { amount: "asc" }, // Changed to asc for lowest bid wins
        include: { user: { select: { name: true, email: true } } },
      },
    },
  })

  if (!bid) notFound()

  const lowestBid = bid.bidCalls[0]
  const meetsMinimum = lowestBid && lowestBid.amount >= bid.guardrailAmount

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-3xl mb-2">{bid.title}</CardTitle>
              <CardDescription className="text-base">{bid.description}</CardDescription>
            </div>
            <Badge
              variant={bid.status === "ACTIVE" ? "default" : "secondary"}
              className="text-base px-4 py-1"
            >
              {bid.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Maximum Budget</p>
              <p className="text-lg font-bold">₹{bid.startingAmount}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Minimum Price</p>
              <p className="text-lg font-bold">₹{bid.guardrailAmount}</p>
            </div>
            <div className="p-4 rounded-lg bg-primary/10">
              <p className="text-xs text-muted-foreground mb-1">Lowest Bid</p>
              <p className="text-lg font-bold text-primary">
                {lowestBid ? `₹${lowestBid.amount}` : "No bids"}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Total Bids</p>
              <p className="text-lg font-bold">{bid.bidCalls.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground mb-1">Start Time</p>
              <p className="font-semibold">{bid.startTime.toLocaleString()}</p>
            </div>
            <div className="p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground mb-1">End Time</p>
              <p className="font-semibold">{bid.endTime.toLocaleString()}</p>
            </div>
          </div>

          {bid.status === "CLOSED" && (
            <Card className={meetsMinimum ? "border-green-500 bg-green-50 dark:bg-green-950" : "border-red-500 bg-red-50 dark:bg-red-950"}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg">
                      {meetsMinimum ? "Winner" : "No Winner"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {meetsMinimum
                        ? `${lowestBid.user.name} won with ₹${lowestBid.amount}`
                        : "Lowest bid is below minimum acceptable price"}
                    </p>
                  </div>
                  {meetsMinimum && <span className="text-3xl">🏆</span>}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">All Bid Calls ({bid.bidCalls.length})</CardTitle>
          <CardDescription>Ranked from lowest to highest - lowest bid wins</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {bid.bidCalls.map((call, i) => (
              <div
                key={call.id}
                className={`flex items-center justify-between rounded-lg border p-4 ${
                  i === 0 ? "border-green-500 bg-green-50 dark:bg-green-950" : ""
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  {i === 0 && <span className="text-2xl">👑</span>}
                  <div className="flex-1">
                    <p className="font-semibold">{call.user.name}</p>
                    <p className="text-sm text-muted-foreground">{call.user.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold">₹{call.amount}</p>
                  <p className="text-xs text-muted-foreground">
                    {call.createdAt.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            {bid.bidCalls.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No bid calls placed yet.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
