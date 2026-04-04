import { SignIn } from "@clerk/nextjs";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Sign In",
  description: "Sign in to access your Signal Score report.",
  path: "/sign-in",
});

export default function SignInPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
      <SignIn />
    </div>
  );
}
