// What to pass as react-pdf's `file` prop for a PDF served by the API.
//
// /uploads requires a login. The API is a different origin from the frontend
// (localhost:5001 vs :3000, separate hosts in deploy), and pdf.js fetches with
// `credentials: 'same-origin'` unless told otherwise, so a bare URL string sends
// no session cookie and every resume and job description 401s. `<iframe src>`
// and `<a href>` are unaffected: the browser attaches the cookie itself.
//
// The result is cached per URL because react-pdf reloads the document whenever
// the `file` prop changes identity, and an object literal in JSX is a new
// object on every render.

type PdfFile = { url: string; withCredentials: true };

const cache = new Map<string, PdfFile>();

export function pdfSource(url: string | null | undefined): PdfFile | null {
  if (!url) return null;
  let source = cache.get(url);
  if (!source) {
    source = { url, withCredentials: true };
    cache.set(url, source);
  }
  return source;
}
