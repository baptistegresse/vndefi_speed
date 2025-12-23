import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Hello Ivy Ivy 👋</h1>
      <p className="text-muted-foreground text-center">
        Just click on sign in — I&apos;ll send you the test credentials on Insta!
      </p>
      <Button asChild>
        <Link href="/account/sign-in">Sign in</Link>
      </Button>
    </div>
  );
}
