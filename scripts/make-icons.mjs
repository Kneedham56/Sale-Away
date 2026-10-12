import sharp from "sharp";
const dir = process.argv[2];
const svg = `${dir}/public/icons/icon.svg`;
await sharp(svg).resize(192, 192).png().toFile(`${dir}/public/icons/icon-192.png`);
await sharp(svg).resize(512, 512).png().toFile(`${dir}/public/icons/icon-512.png`);
// Apple and maskable icons: full-bleed square (the OS applies its own mask)
const square = Buffer.from((await import("node:fs")).readFileSync(svg, "utf8").replace('rx="112"', 'rx="0"'));
await sharp(square).resize(180, 180).png().toFile(`${dir}/public/icons/apple-touch-icon.png`);
const inner = await sharp(square).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#1f4e79" } })
  .composite([{ input: inner, gravity: "center" }]).png().toFile(`${dir}/public/icons/icon-maskable-512.png`);
await sharp(svg).resize(48, 48).toFormat("png").toFile(`${dir}/src/app/icon.png`);
console.log("icons ok");
