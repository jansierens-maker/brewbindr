## 2026-02-15 - Privilege Escalation via Client-Side Profile Updates
**Vulnerability:** Users could promote themselves to 'admin' by including `role: 'admin'` in the profile update request sent to Supabase.
**Learning:** Even with RLS policies like `auth.uid() = id`, users can still modify sensitive columns if the policy doesn't explicitly restrict them. In multi-tenant apps, role management must be strictly decoupled from user-controlled profile updates.
**Prevention:**
1. Exclude sensitive fields (like `role`) from client-side update functions.
2. Use `WITH CHECK` clauses in RLS policies to ensure sensitive columns remain immutable or are only changeable by authorized roles.
3. Prefer backend triggers or server-side functions for sensitive state transitions.
