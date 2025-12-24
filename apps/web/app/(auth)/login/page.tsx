import { LoginForm } from "./login-form";

export const runtime = "nodejs";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const next = typeof searchParams.next === "string" ? searchParams.next : "/";
  return <LoginForm next={next} />;
}


