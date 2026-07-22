; CyberViewer NSIS customizations (electron-builder include)
; - Per-user HKCU associations for common image types (default: on)
; - Cleanup on uninstall
;
; Keep this file free of unused Vars/Functions: electron-builder runs makensis
; with warnings-as-errors, and compiles both installer and uninstaller passes.

!include "LogicLib.nsh"

; Write a single ProgID + extension default under HKCU (current user)
!macro CV_WriteImageAssoc EXT PROGID DESC
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "${DESC}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open" "" "Open"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\${EXT}" "" "${PROGID}"
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}" ""
!macroend

!macro customInstall
  ; Register per-user defaults so double-click can open CyberViewer (best-effort on Win10/11).
  !insertmacro CV_WriteImageAssoc ".jpg"  "CyberViewer.jpg"  "JPEG Image"
  !insertmacro CV_WriteImageAssoc ".jpeg" "CyberViewer.jpg"  "JPEG Image"
  !insertmacro CV_WriteImageAssoc ".png"  "CyberViewer.png"  "PNG Image"
  !insertmacro CV_WriteImageAssoc ".gif"  "CyberViewer.gif"  "GIF Image"
  !insertmacro CV_WriteImageAssoc ".webp" "CyberViewer.webp" "WebP Image"
  !insertmacro CV_WriteImageAssoc ".bmp"  "CyberViewer.bmp"  "BMP Image"
  !insertmacro CV_WriteImageAssoc ".tif"  "CyberViewer.tiff" "TIFF Image"
  !insertmacro CV_WriteImageAssoc ".tiff" "CyberViewer.tiff" "TIFF Image"

  WriteRegStr HKCU "Software\CyberViewer\Capabilities" "ApplicationName" "CyberViewer"
  WriteRegStr HKCU "Software\CyberViewer\Capabilities" "ApplicationDescription" "CyberViewer image viewer"
  WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".jpg" "CyberViewer.jpg"
  WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".jpeg" "CyberViewer.jpg"
  WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".png" "CyberViewer.png"
  WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".gif" "CyberViewer.gif"
  WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".webp" "CyberViewer.webp"
  WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".bmp" "CyberViewer.bmp"
  WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".tif" "CyberViewer.tiff"
  WriteRegStr HKCU "Software\CyberViewer\Capabilities\FileAssociations" ".tiff" "CyberViewer.tiff"
  WriteRegStr HKCU "Software\RegisteredApplications" "CyberViewer" "Software\CyberViewer\Capabilities"

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\CyberViewer.jpg"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.png"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.gif"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.webp"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.bmp"
  DeleteRegKey HKCU "Software\Classes\CyberViewer.tiff"
  DeleteRegKey HKCU "Software\CyberViewer"
  DeleteRegValue HKCU "Software\RegisteredApplications" "CyberViewer"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
