!include "FileFunc.nsh"
; Do not use the builder's process-name fallback or force-kill a server during
; backups. Inspect only this installation path and require a graceful close.
!macro customCheckAppRunning
  System::Call 'Kernel32::SetEnvironmentVariableW(w "SCHOOL_PREVIEW_INSTALL_DIR", w "$INSTDIR") i .r0'
  nsExec::Exec '"$PowerShellPath" -NoProfile -NonInteractive -WindowStyle Hidden -Command "try { $$target=[IO.Path]::GetFullPath($$env:SCHOOL_PREVIEW_INSTALL_DIR).TrimEnd([char]92)+[char]92; $$p=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$target,[StringComparison]::OrdinalIgnoreCase) }); if($$p.Count -gt 0){exit 2}; exit 0 } catch { exit 3 }"'
  Pop $R0
  StrCmp $R0 0 preview_process_check_complete
  MessageBox MB_OK|MB_ICONSTOP "Close this installed School Desktop Preview normally and wait for its database to stop before continuing. If process inspection is denied, use the same Windows account and check local policy." /SD IDOK
  SetErrorLevel 2
  Quit
  preview_process_check_complete:
!macroend
; Validate before extraction or old-version removal, including silent installs.
!macro customInit
  GetFullPathName $R0 "$LOCALAPPDATA\SchoolManagementDesktopPreview"
  GetFullPathName $R1 "$INSTDIR"
  StrCpy $R2 $R0
  preview_check_data_parent:
    StrCmp $R2 $R1 preview_unsafe_directory
    ${GetParent} "$R2" $R3
    StrCmp $R3 "" preview_check_install_start
    StrCmp $R3 $R2 preview_check_install_start
    StrCpy $R2 $R3
    Goto preview_check_data_parent
  preview_check_install_start:
    StrCpy $R2 $R1
  preview_check_install_parent:
    StrCmp $R2 $R0 preview_unsafe_directory
    ${GetParent} "$R2" $R3
    StrCmp $R3 "" preview_safe_directory
    StrCmp $R3 $R2 preview_safe_directory
    StrCpy $R2 $R3
    Goto preview_check_install_parent
  preview_unsafe_directory:
    MessageBox MB_OK|MB_ICONSTOP "Choose an installation directory separate from the persistent SchoolManagementDesktopPreview data folder."
    Abort
  preview_safe_directory:
  DetailPrint "School databases, settings and backups are stored outside the installation directory."
!macroend
!macro customUnInstall
  DetailPrint "Persistent school data and encrypted backups have been retained."
!macroend
