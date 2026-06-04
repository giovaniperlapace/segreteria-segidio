import "server-only";

import type { User } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const USERS_PER_PAGE = 1000;

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const service = createSupabaseServiceClient();

  for (let page = 1; ; page += 1) {
    const {
      data: { users },
      error,
    } = await service.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });

    if (error) {
      throw error;
    }

    const user = users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );

    if (user) {
      return user;
    }

    if (users.length < USERS_PER_PAGE) {
      return null;
    }
  }
}

