import { auth } from "@/app/lib/auth";
import Navbar from "@/components/Navbar";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/account/sign-in");
  }

  return (
    <div>
      <Navbar />
      {children}
    </div>
  );
}