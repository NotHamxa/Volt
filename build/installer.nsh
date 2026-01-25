!macro customInstall
  ; Ask user if they want the app to start on boot
  MessageBox MB_YESNO "Do you want Volt to start with Windows?" IDYES addStartup

  Goto done

  addStartup:
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Volt" "$INSTDIR\Volt.exe"

  done:
!macroend

!macro customUnInstall
  ; Remove startup entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Volt"
!macroend
