// Cloudinary resizes on request: a transformation goes between `/upload/` and the file's version/path
// (https://cloudinary.com/documentation/image_transformations). Covers moved there by the pipeline
// (scripts/pipeline/cloudinary.ts) use it the way Unsplash covers use their CDN's w/h parameters.

const UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;

export const isCloudinaryImage = (url: string | undefined) => Boolean(url && UPLOAD.test(url));

/** The image cropped to `w`×`h`, around its most interesting part, in `format` (auto: the best the browser takes). */
export function cloudinarySized(url: string, w: number, h: number, format: 'auto' | 'jpg' = 'auto'): string {
  const m = url.match(UPLOAD);
  if (!m) return url;
  return `${m[1]}c_fill,g_auto,w_${w},h_${h},f_${format},q_auto/${m[2]}`;
}

const VIDEO = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/;

/** A clip scaled down for a card: the full-screen cover clip is several times the pixels a card needs. */
export function cloudinaryVideoSized(url: string, w: number, h: number): string {
  const m = url.match(VIDEO);
  return m ? `${m[1]}c_fill,w_${w},h_${h},q_auto/${m[2]}` : url;
}
