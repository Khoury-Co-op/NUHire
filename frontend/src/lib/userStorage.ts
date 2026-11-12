// Student pages scope their localStorage keys by user id, because a shared lab
// browser otherwise hands one student's saved progress to the next.
export const userScope = (prefix: string, userId: string) => `${prefix}:${userId}:`;

// Removes this page's keys for any other user, and the legacy unscoped keys
// from before scoping existed, so nothing left behind by a previous login on
// this browser can be mistaken for the current student's progress.
export const dropOtherUsersKeys = (prefix: string, userId: string) => {
  const own = userScope(prefix, userId);
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix) && !key.startsWith(own)) {
      localStorage.removeItem(key);
    }
  }
};
