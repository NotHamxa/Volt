!macro customInstall
!macroend

!macro customUnInstall
  ; Remove startup entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Volt"
!macroend
