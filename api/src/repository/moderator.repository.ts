import { DbClient } from '../config/database';

export interface ModeratorRepository {
  /** Whether `adminEmail` is the professor on the Moderator row for this CRN. */
  teaches(adminEmail: string, classId: number): Promise<boolean>;
}

export function createModeratorRepository(db: DbClient): ModeratorRepository {
  return {
    teaches: async (adminEmail, classId) => {
      const moderator = await db.moderator.findUnique({
        where: { crn: classId },
        select: { admin_email: true },
      });
      return moderator?.admin_email === adminEmail;
    },
  };
}
