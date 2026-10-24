import { configExists, loadConfig } from "./config.js";
import { handleMessage, hasOwner, introduceToGroup, pairingInfo, whenOwnerClaimed } from "./bot.js";
import { acquireSingleInstanceLock, isDesktop } from "./desktop.js";
import { startScheduler } from "./scheduler.js";
import { runWizard } from "./setup/wizard.js";
import { botNumber, connect } from "./wa/client.js";

// `setup` = jalanin wizard, sambungin WA, klaim owner, terus keluar (dipakai di Docker & shortcut "Ganti pengaturan AI").
// `pair`  = kayak setup tapi tanpa wizard: cuma sambungin WA + klaim owner (dipakai Japri.exe kalau setup sempat kepotong).
// Tanpa argumen = jalan terus; wizard otomatis muncul kalau belum pernah setup.
const pairOnly = process.argv[2] === "pair";
const setupOnly = process.argv[2] === "setup" || pairOnly;
const interactive = process.stdin.isTTY;

async function waitForConfig() {
  console.log(
    isDesktop
      ? "⚠️  Japri belum di-setup. Buka Japri dari ikon di Desktop / Start Menu buat mulai setup.\nNunggu setup selesai..."
      : "⚠️  Bot belum di-setup. Jalankan dulu:\n" +
          "     docker compose run --rm japri setup   (kalau pakai Docker)\n" +
          "     npm start                             (kalau langsung pakai Node)\n" +
          "Nunggu setup selesai...",
  );
  while (!configExists()) await new Promise((r) => setTimeout(r, 5000));
}

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

if (isDesktop && !acquireSingleInstanceLock()) {
  console.log(
    "ℹ️  Japri udah jalan (cek ikon Japri di system tray, pojok kanan bawah).\n" +
      (setupOnly ? "   Keluarin dulu Japri dari menu tray-nya, baru buka \"Ganti pengaturan AI\" lagi.\n" : ""),
  );
  process.exit(2);
}

if ((setupOnly && !pairOnly) || !configExists()) {
  if (interactive) {
    await runWizard().catch((e) => {
      if (e instanceof Error && e.name === "ExitPromptError") {
        console.log("\nSetup dibatalkan.");
        process.exit(0);
      }
      throw e;
    });
  } else {
    await waitForConfig();
  }
}

let readyOnce = false;
await connect({
  onMessage: handleMessage,
  onJoinedGroup: introduceToGroup,
  onReady: () => {
    if (!hasOwner()) {
      console.log(pairingInfo());
    } else if (!readyOnce) {
      const { botName, llm } = loadConfig();
      console.log(`🤖 ${botName} siap di wa.me/${botNumber()} — AI: ${llm.provider}/${llm.model}`);
    }
    if (setupOnly && hasOwner()) finishSetup();
    readyOnce = true;
    startScheduler();
  },
});

whenOwnerClaimed(() => {
  if (setupOnly) finishSetup();
});

function finishSetup() {
  if (isDesktop) {
    console.log("\n🎉 Setup selesai! Jendela ini bakal ketutup sendiri, terus Japri jalan di system tray");
    console.log("   (ikon Japri di pojok kanan bawah, deket jam).\n");
  } else {
    const next = process.env.RUNNING_IN_DOCKER ? "docker compose up -d" : "npm start";
    console.log(`\n🎉 Setup selesai! Jalankan botnya:\n     ${next}\n`);
  }
  // Kasih waktu session WA & pesan sambutan tersimpan/terkirim
  setTimeout(() => process.exit(0), 3000);
}
