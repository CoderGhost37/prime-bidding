import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create New Tender | Prime Bidding Admin",
  description: "Create a new tender for transportation with maximum budget and minimum price settings.",
}

export default function NewBidPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl">Create New Tender</CardTitle>
          <CardDescription className="text-base">
            Set up a new transportation tender for distributors to bid on
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createBidAction} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-base font-semibold">
                Tender Title
              </Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g., Transportation from Delhi to Mumbai"
                required
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-base font-semibold">
                Description
              </Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Provide detailed information about the route, load requirements, vehicle specifications, etc."
                required
                className="min-h-32 resize-none"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startingAmount" className="text-base font-semibold">
                  Maximum Budget (₹)
                </Label>
                <Input
                  id="startingAmount"
                  name="startingAmount"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="50000"
                  required
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  The maximum amount you're willing to pay
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="guardrailAmount" className="text-base font-semibold">
                  Minimum Acceptable Price (₹)
                </Label>
                <Input
                  id="guardrailAmount"
                  name="guardrailAmount"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="30000"
                  required
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Bids below this amount won't be accepted
                </p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startTime" className="text-base font-semibold">
                  Start Time
                </Label>
                <Input
                  id="startTime"
                  name="startTime"
                  type="datetime-local"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime" className="text-base font-semibold">
                  End Time
                </Label>
                <Input
                  id="endTime"
                  name="endTime"
                  type="datetime-local"
                  required
                  className="h-11"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" size="lg" className="flex-1 h-12 text-base font-semibold">
                Create Tender
              </Button>
              <Link href="/admin/dashboard">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12"
                >
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
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
