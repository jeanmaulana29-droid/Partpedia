/**
 * Perdalam riwayat git sebelum build agar loadArticles.js
 * mendapat timestamp commit yang benar di Vercel (shallow clone).
 */
import { execSync } from "node:child_process";

function run(cmd) {
  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Urutan: unshallow → deepen besar → deepen sedang
if (!run("git fetch --unshallow")) {
  if (!run("git fetch --deepen=500")) {
    run("git fetch --deepen=200");
  }
}
