// src/models/User.ts

export interface User {
  id: number;
  f_name: string;
  l_name: string;
  email: string;
  // 'none' is what the Keycloak callback inserts for a first-time login that
  // is not on any roster yet.
  affiliation: 'student' | 'admin' | 'none';
  group_id?: number;
  class?: number;
  current_page?:
    'dashboard' | 'resumepage' | 'resumepage2' | 'jobdes' | 'interviewpage' | 'makeofferpage';
  seen?: number;
  // When the student was first seen since their group started; null until then.
  present_at?: Date | null;
  keycloakProfile?: any;
}

export function isAdmin(user: Pick<User, 'affiliation'> | undefined): boolean {
  return user?.affiliation === 'admin';
}
