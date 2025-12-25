import { LoginForm } from "./login-form";

export const runtime = "nodejs";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return <LoginForm next={next} />;
}


