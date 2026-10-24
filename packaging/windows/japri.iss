; Installer Windows buat Japri (Inno Setup 6).
; Di-build sama packaging/windows/build.ps1 — jangan di-compile langsung tanpa folder dist\windows.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define Stage "..\..\dist\windows"

[Setup]
AppId={{6B0F2C7E-3B7A-4E52-9D0B-6F0C1B7A4A11}
AppName=Japri
AppVersion={#AppVersion}
AppVerName=Japri {#AppVersion}
AppPublisher=Rifaldi Rizqi
AppPublisherURL=https://github.com/rifaldirizqi/japri
AppSupportURL=https://github.com/rifaldirizqi/japri/issues
; Install per-user: gak butuh hak admin
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\Japri
DisableProgramGroupPage=yes
DisableDirPage=auto
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\dist
OutputBaseFilename=JapriSetup-{#AppVersion}
SetupIconFile=japri.ico
UninstallDisplayIcon={app}\japri.ico
UninstallDisplayName=Japri
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=force

[Languages]
Name: "id"; MessagesFile: "compiler:Default.isl"

[Messages]
; Teks utama installer dalam bahasa Indonesia
SetupAppTitle=Install Japri
SetupWindowTitle=Install Japri {#AppVersion}
WelcomeLabel1=Selamat datang di installer Japri
WelcomeLabel2=Japri adalah asisten pribadi buat grup WhatsApp: ngabarin lo kalau di-mention, bikin rangkuman grup, dan ngingetin hal penting.%n%nSiapin: HP dengan nomor WhatsApp KHUSUS buat bot, dan API key AI (Claude, OpenAI, Gemini, dll).
SelectTasksLabel2=Pilih opsi tambahan, terus klik Next.
ReadyLabel1=Japri siap di-install.
FinishedHeadingLabel=Japri udah ter-install
FinishedLabel=Klik Finish buat mulai Japri. Kalau ini pertama kali, ikuti langkah setup di jendela yang muncul. Setelah itu Japri jalan di system tray (ikon di pojok kanan bawah, deket jam).
ClickNext=Klik Next buat lanjut, atau Cancel buat batal.
ButtonNext=&Next >
ButtonInstall=&Install
ButtonFinish=&Finish

[Tasks]
Name: "desktopicon"; Description: "Bikin ikon Japri di Desktop"
Name: "autostart"; Description: "Jalankan Japri otomatis tiap Windows nyala (disarankan)"

[Files]
Source: "{#Stage}\Japri.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "japri.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Stage}\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs
; Folder app di-replace total tiap update biar gak ada file lama nyangkut
Source: "{#Stage}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
Type: filesandordirs; Name: "{app}\app"

[Icons]
Name: "{autoprograms}\Japri"; Filename: "{app}\Japri.exe"; IconFilename: "{app}\japri.ico"; Comment: "Jalankan Japri"
Name: "{autoprograms}\Japri - Ganti pengaturan AI"; Filename: "{app}\Japri.exe"; Parameters: "setup"; IconFilename: "{app}\japri.ico"
Name: "{autoprograms}\Japri - Buka folder data"; Filename: "{win}\explorer.exe"; Parameters: """{localappdata}\Japri\data"""
Name: "{autodesktop}\Japri"; Filename: "{app}\Japri.exe"; IconFilename: "{app}\japri.ico"; Tasks: desktopicon
Name: "{userstartup}\Japri"; Filename: "{app}\Japri.exe"; IconFilename: "{app}\japri.ico"; Tasks: autostart

[Run]
Filename: "{app}\Japri.exe"; Description: "Jalankan Japri sekarang"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM Japri.exe"; Flags: runhidden; RunOnceId: "StopJapri"

[Code]
// Matiin Japri yang lagi jalan sebelum file-nya ditimpa (waktu update)
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /T /IM Japri.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

// Tawarin hapus data (session WA, pengaturan, catatan grup) waktu uninstall
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    if MsgBox('Hapus juga data Japri (pengaturan, session WhatsApp, dan catatan grup)?' + #13#10 +
              'Pilih No kalau mau install ulang nanti tanpa setup dari awal.',
              mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      DelTree(ExpandConstant('{localappdata}\Japri'), True, True, True);
end;
