import { configExists, loadConfig } from "./config.js";
import { handleMessage, hasOwner, introduceToGroup, pairingInfo, setupCode, whenOwnerClaimed } from "./bot.js";
import { acquireSingleInstanceLock, isDesktop, isTray, reportInfo } from "./desktop.js";
import { startScheduler } from "./scheduler.js";
import { startSettingsServer } from "./setup/settings-web.js";
import { startSetupServer } from "./setup/web.js";
import { runWizard } from "./setup/wizard.js";
import { botNumber, connect } from "./wa/client.js";

// `setup` = jalanin wizard, sambungin WA, klaim owner, terus keluar (dipakai di Docker & "Setup ulang" di Windows).
// `pair`  = kayak setup tapi tanpa wizard: cuma sambungin WA + klaim owner (dipakai Japri.exe kalau setup sempat kepotong).
// Tanpa argumen = jalan terus; wizard otomatis muncul kalau belum pernah setup.
const pairOnly = process.argv[2] === "pair";
const setupOnly = process.argv[2] === "setup" || pairOnly;
const interactive = process.stdin.isTTY;
// Japri.exe (Windows): setup lewat jendela wizard (setup/wizard.html), bukan terminal
const webSetup = isDesktop && setupOnly && process.env.JAPRI_SETUP_UI === "web";

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
      (setupOnly ? "   Pakai tombol \"Pengaturan\" di jendela Japri.\n" : ""),
  );
  process.exit(2);
}

if (webSetup) {
  const wizard = await startSetupServer({
    pairOnly,
    pairing: () => ({ bot: botNumber() || undefined, ownerClaimed: hasOwner(), setupCode }),
    onFinish: () => process.exit(0),
    onCancel: () => process.exit(0),
  });
  process.stdout.write(`@@japri-setup-url ${wizard.url}\n`); // dibaca Japri.exe, terus dibuka di jendela setup
  await wizard.saved;
} else if ((setupOnly && !pairOnly) || !configExists()) {
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

// Japri.exe: jendela Pengaturan dilayani proses ini, jadi perubahan langsung kepakai tanpa restart
if (isTray && !setupOnly) {
  const settings = await startSettingsServer({
    botNumber,
    onResetup: () => process.stdout.write("@@japri-command setup\n"), // Japri.exe yang buka jendela setup
  });
  process.stdout.write(`@@japri-settings-url ${settings.url}\n`);
}

let readyOnce = false;
await connect({
  onMessage: handleMessage,
  onJoinedGroup: introduceToGroup,
  onReady: () => {
    const { llm } = loadConfig();
    reportInfo({ bot: botNumber(), ai: `${llm.provider} / ${llm.model}` });
    if (!hasOwner()) {
      console.log(pairingInfo());
    } else if (!readyOnce) {
      const { botName } = loadConfig();
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
  if (webSetup) return; // jendela wizard yang nampilin "selesai"; keluarnya pas user klik Selesai
  if (isDesktop) {
    console.log("\n🎉 Setup selesai! Jendela ini bakal ketutup sendiri, terus jendela Japri kebuka.");
    console.log("   Jendela Japri boleh ditutup kapan aja: Japri tetap jalan di system tray (pojok kanan bawah).\n");
  } else {
    const next = process.env.RUNNING_IN_DOCKER ? "docker compose up -d" : "npm start";
    console.log(`\n🎉 Setup selesai! Jalankan botnya:\n     ${next}\n`);
  }
  // Kasih waktu session WA & pesan sambutan tersimpan/terkirim
  setTimeout(() => process.exit(0), 3000);
}
