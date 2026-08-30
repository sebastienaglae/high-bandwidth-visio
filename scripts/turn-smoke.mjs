import { execFileSync } from "node:child_process";

const credential = process.env.TURN_CREDENTIAL;
if (!credential) throw new Error("TURN_CREDENTIAL is required for the TURN smoke test");

const compose = ["compose", "--profile", "turn", "exec", "-T", "coturn"];
const addresses = execFileSync("docker", [...compose, "hostname", "-i"], { encoding: "utf8" })
  .trim().split(/\s+/).filter((address) => address && address !== "127.0.0.1" && address !== "::1");
if (!addresses.length) throw new Error("No non-loopback TURN address was found");

execFileSync("docker", [
  ...compose,
  "turnutils_uclient",
  "-u", process.env.TURN_USERNAME || "visio",
  "-w", credential,
  "-p", "3478",
  "-n", "1",
  "-c",
  "-y", addresses[0],
  addresses[0],
], { stdio: "inherit", timeout: 30_000 });

console.log(`TURN allocation and relay smoke passed through ${addresses[0]}`);
