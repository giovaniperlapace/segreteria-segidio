import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmailTemplateManagement } from "./email-template-management";

export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const { data: templates, error } = await supabase
    .from("email_templates")
    .select("id,name,subject,body_text,active,updated_at")
    .order("active", { ascending: false })
    .order("name");

  if (error) throw error;

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">Template email</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Testi riutilizzabili per inviti e comunicazioni evento.
          </p>
        </header>
        <EmailTemplateManagement
          templates={(templates ?? []).map((template) => ({
            id: Number(template.id),
            name: String(template.name),
            subject: String(template.subject),
            body_text: String(template.body_text),
            active: Boolean(template.active),
            updated_at: String(template.updated_at),
          }))}
        />
      </div>
    </main>
  );
}
