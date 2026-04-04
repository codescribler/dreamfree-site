import { SignUp } from "@clerk/nextjs";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Sign Up",
  description: "Create an account to access your Signal Score report.",
  path: "/sign-up",
});

export default function SignUpPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
      <SignUp />
    </div>
  );
}
