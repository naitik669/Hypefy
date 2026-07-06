// One-off repair: three legacy post images were uploaded raw (1.5–6.2MB)
// before the crop/compress pipeline existed, and their size makes the
// next/image optimizer time out (500). Re-encode each to ≤1080px JPEG q85
// and overwrite the same storage path so posts.image_url stays valid.
// Run: SUPABASE_SERVICE_ROLE_KEY=... node scripts/fix-oversized-images.mjs
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://fyaioseridqabockidyp.supabase.co";
// Service role bypasses RLS; the anon key works too if a temporary
// storage.objects policy scoped to these exact paths is in place.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required.");
  process.exit(1);
}

const BUCKET = "post-images";
const PATHS = [
  "9b085829-566e-4803-a6c5-601f4f2aac5f/1780403294634.jpg",
  "9b085829-566e-4803-a6c5-601f4f2aac5f/1780404634098.jpg",
  "8366c3be-7902-4cd1-9da7-3e53688b0637/1780515380296.jpeg",
];

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

for (const path of PATHS) {
  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`SKIP ${path}: download failed (${res.status})`);
    continue;
  }
  const original = Buffer.from(await res.arrayBuffer());
  const recoded = await sharp(original)
    .rotate() // bake in EXIF orientation before it's stripped
    .resize({ width: 1080, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, recoded, { contentType: "image/jpeg", upsert: true });
  if (error) {
    console.error(`FAIL ${path}: ${error.message}`);
    continue;
  }
  console.log(
    `OK ${path}: ${(original.length / 1024 / 1024).toFixed(1)}MB -> ${(recoded.length / 1024).toFixed(0)}KB`,
  );
}
