"use client";

import { signOut } from "@/app/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

export default function Navbar() {

  const router = useRouter();

  return (
    <nav className="flex justify-between items-center p-4">
      <Link href="/dashboard">
        Dashboard
      </Link>
      <Button onClick={() => signOut().then(() => {
        router.push("/account/sign-in");
      })}>
        Logout
      </Button>
    </nav>
  )
}
