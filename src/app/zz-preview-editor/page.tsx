"use client";
import { useEffect, useState } from "react";
import { ShowEditor } from "@/components/shows/ShowEditor";
export default function P() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 390; c.height = 844;
    const g = c.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 0, 844);
    gr.addColorStop(0, "#f07d1f"); gr.addColorStop(0.6, "#6b7a2c"); gr.addColorStop(1, "#46561f");
    g.fillStyle = gr; g.fillRect(0, 0, 390, 844);
    setUrl(c.toDataURL());
  }, []);
  if (!url) return null;
  return <ShowEditor photoUrl={url} onCancel={() => {}} onPublish={(l) => console.log("PUBLISH", JSON.stringify(l))} />;
}
