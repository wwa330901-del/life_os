#pragma code page 65001
; Inno Setup script for life_os (product name: 元序).
;
; Builds a single distributable Setup.exe from the already-built Release
; output (run `flutter build windows --release` first). Installs per-user
; by default (no admin rights required) and always creates a Start Menu
; entry + Desktop shortcut. Also doubles as the silent auto-updater target:
; the running app downloads this exe and re-runs it with /VERYSILENT, so
; CloseApplications=force is set to have Setup close the running instance
; via Restart Manager as a backstop (the app also exits itself first).
;
; Build with: ISCC.exe installer\life_os.iss

#define MyAppName "元序"
#define MyAppVersion "2.9.30"
#define MyAppPublisher "元序"
#define MyAppExeName "life_os_app.exe"

[Setup]
AppId={{B7B6E1B0-6C3E-4B2A-9E36-6B7F6E0B6C1A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Per-user install by default so a non-admin user can install this
; themselves; {autopf} resolves to the user's local Programs folder when
; running without elevation.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline dialog
OutputDir=Output
OutputBaseFilename=life_os_setup
SetupIconFile=..\windows\runner\resources\app_icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Backstop for silent self-update: detect + close the running exe via
; Restart Manager even if the app didn't fully exit before Setup starts.
CloseApplications=force
RestartApplications=no

[Languages]
Name: "chinesetraditional"; MessagesFile: "compiler:Languages\ChineseTraditional.isl"

[Files]
Source: "..\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\解除安裝 {#MyAppName}"; Filename: "{uninstallexe}"
; Always created (not an opt-in task) — installing should leave a desktop
; shortcut behind without the user having to remember to check a box.
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
; No "skipifsilent" — this must also relaunch the app after a silent
; auto-update, not just after an interactive first install.
Filename: "{app}\{#MyAppExeName}"; Description: "啟動 {#MyAppName}"; Flags: nowait postinstall
