// E2E: with E2EE enabled on BOTH participants, encrypted media must still
// decode on the receiving side (remote tile renders frames).
import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
async function join(name, room) {
  const ctx = await browser.newContext({ locale: "en-US", permissions: ["microphone", "camera"] });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("visio:e2ee", "1"));
  await p.goto(`http://localhost:5173/j/${room}`, { waitUntil: "networkidle" });
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Join room" }).click();
  await p.waitForSelector(".grid .tile", { timeout: 15000 });
  return p;
}
const ROOM = "e2ee-room-aaaaaaaaaaaaaaaaaa";
const a = await join("Alice", ROOM);
await a.waitForTimeout(1500);
const b = await join("Bob", ROOM);
await a.waitForFunction(() => document.querySelectorAll(".grid .tile").length >= 2, null, { timeout: 20000 });
await b.waitForTimeout(8000); // let encrypted frames flow

const probe = async (p, tag) => {
  const vids = await p.evaluate(() =>
    [...document.querySelectorAll(".tile video")].map((v) => ({
      w: v.videoWidth,
      ready: v.readyState,
      src: !!v.srcObject,
    }))
  );
  console.log(tag, JSON.stringify(vids));
  const remote = vids.find((v) => v.src && v.w > 0);
  return !!remote;
};
const aOk = await probe(a, "alice:");
const bOk = await probe(b, "bob:  ");
console.log("E2EE remote video decoding:", aOk && bOk ? "ok" : "FAIL");
await browser.close();
process.exit(aOk && bOk ? 0 : 1);
