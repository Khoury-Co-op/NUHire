// The API's base URL, read once here rather than in every file that calls it.
//
// Next.js inlines NEXT_PUBLIC_* at build time, so a build without it ships
// pages that fetch `undefined/...` and fail one request at a time. Refuse in the
// browser instead, where the first page load shows why. The build and the tests
// do not throw: the CI image build (frontend/Dockerfile.prod) runs without the
// variable, and failing it there is a deploy decision, not this file's.
const url = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!url && typeof window !== 'undefined') {
  throw new Error(
    'NEXT_PUBLIC_API_BASE_URL is not set, so this build cannot reach the API. ' +
      'Set it (see frontend/.env.example) and rebuild the frontend.'
  );
}

export const API_BASE_URL: string = url ?? '';
