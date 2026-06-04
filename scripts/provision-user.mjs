import { createClient } from "@supabase/supabase-js";

const [emailInput, roleInput = "reference", firstNameInput, ...lastNameParts] =
  process.argv.slice(2);
const email = emailInput?.trim().toLowerCase();
const firstName = firstNameInput?.trim() || email?.split("@")[0] || "";
const lastName = lastNameParts.join(" ").trim();
const fullName = [firstName, lastName].filter(Boolean).join(" ");
const role = roleInput.trim().toLowerCase();

if (!email || !firstName || !lastName || !["manager", "reference"].includes(role)) {
  console.error(
    "Usage: npm run user:provision -- email@example.org manager|reference FirstName LastName",
  );
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const {
  data: { users },
  error: listError,
} = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

if (listError) throw listError;

let user = users.find((candidate) => candidate.email?.toLowerCase() === email);
if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error) throw error;
  user = data.user;
}

const { error: profileError } = await supabase.from("profiles").upsert({
  id: user.id,
  email,
  first_name: firstName,
  last_name: lastName,
  full_name: fullName,
  role,
  active: true,
});

if (profileError) throw profileError;

console.log(`Provisioned ${email} as ${role}.`);
