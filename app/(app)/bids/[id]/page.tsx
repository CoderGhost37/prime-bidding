import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import type { Metadata } from "next"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const bid = await prisma.bid.findUnique({
    where: { id },
    select: { title: true, description: true },
  })

  return {
    title: bid ? `${bid.title} | Prime Bidding` : "Tender Details | Prime Bidding",
    description: bid?.description || "View tender details and place your bid on Prime Bidding.",
  }
}

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
        orderBy: { amount: "asc" }, // Changed to asc for lowest bid wins
        include: { user: { select: { name: true, id: true } } },
      },
    },
  })

  if (!bid) notFound()

  const myCall = bid.bidCalls.find((c) => c.userId === userId)
  const lowestBid = bid.bidCalls[0]
  const isMyBidWinning = myCall && lowestBid?.userId === userId

  return (
    <div className="mx-auto max-w-4xl space-y-6">
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
            <div className="p-4 rounded-lg bg-primary/10">
              <p className="text-xs text-muted-foreground mb-1">Lowest Bid</p>
              <p className="text-lg font-bold text-primary">
                {lowestBid ? `₹${lowestBid.amount}` : "No bids yet"}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Total Bids</p>
              <p className="text-lg font-bold">{bid.bidCalls.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Ends</p>
              <p className="text-sm font-semibold">{bid.endTime.toLocaleDateString()}</p>
              <p className="text-xs text-muted-foreground">{bid.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>

          {myCall && (
            <Card className={isMyBidWinning ? "border-green-500 bg-green-50 dark:bg-green-950" : "border-orange-500 bg-orange-50 dark:bg-orange-950"}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">Your Current Bid</p>
                  <p className="text-sm text-muted-foreground">
                    {isMyBidWinning ? "You're winning!" : "You've been outbid"}
                  </p>
                </div>
                <p className="text-2xl font-bold">₹{myCall.amount}</p>
              </CardContent>
            </Card>
          )}

          {bid.status === "ACTIVE" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Place Your Bid</CardTitle>
                <CardDescription>
                  {lowestBid
                    ? `Maximum bid: ₹${lowestBid.amount - 1} (must be lower than current lowest)`
                    : `Maximum bid: ₹${bid.startingAmount}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={placeBidAction} className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="amount">Bid Amount (₹)</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      step="1"
                      required
                      max={
                        lowestBid
                          ? lowestBid.amount - 1
                          : bid.startingAmount
                      }
                      placeholder={
                        lowestBid
                          ? `Max: ₹${lowestBid.amount - 1}`
                          : `Max: ₹${bid.startingAmount}`
                      }
                      className="h-12 text-lg"
                    />
                  </div>
                  <input type="hidden" name="bidId" value={bid.id} />
                  <Button type="submit" size="lg" className="self-end h-12 px-8 font-semibold">
                    Place Bid
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">All Bids ({bid.bidCalls.length})</CardTitle>
          <CardDescription>Ranked from lowest to highest</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {bid.bidCalls.map((call, i) => (
              <div
                key={call.id}
                className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
                  i === 0 ? "border-green-500 bg-green-50 dark:bg-green-950" : ""
                } ${call.userId === userId ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="flex items-center gap-3">
                  {i === 0 && <span className="text-2xl">👑</span>}
                  <div>
                    <p className="font-semibold">
                      {call.user.name}
                      {call.userId === userId && (
                        <span className="ml-2 text-xs text-primary">(You)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {call.createdAt.toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="text-xl font-bold">₹{call.amount}</p>
              </div>
            ))}
            {bid.bidCalls.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No bids yet. Be the first to place a bid!
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
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

  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: {
      bidCalls: {
        orderBy: { amount: "asc" },
        take: 1,
      },
    },
  })

  if (!bid || bid.status !== "ACTIVE") throw new Error("Tender is not active")

  const lowestBid = bid.bidCalls[0]

  // Validate that the new bid is lower than the current lowest (or lower than starting amount if no bids)
  if (lowestBid && amount >= lowestBid.amount) {
    throw new Error("Your bid must be lower than the current lowest bid")
  }

  if (!lowestBid && amount > bid.startingAmount) {
    throw new Error("Your bid must be lower than or equal to the maximum budget")
  }

  await prisma.bidCall.create({
    data: { amount, bidId, userId },
  })

  revalidatePath(`/bids/${bidId}`)
  revalidatePath("/dashboard")
}
