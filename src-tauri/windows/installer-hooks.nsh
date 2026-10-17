; Extra installer steps (bundle.windows.nsis.installerHooks in tauri.conf.json).
;
; Tauri's installer already adds .md / .markdown to "Open with" (ProgID SlateViewer.Markdown).
; These steps also register Slate Viewer as a default-app candidate, so it is listed under
; Settings > Apps > Default apps and File > "Make Slate Viewer the Default for .md Files" can
; open its page there. Windows only lets the user pick the default; no app can set it itself.

; Explorer's right-click menu gets "Open in Slate Viewer" on folders, on the empty space inside a
; folder, and on .md / .markdown files (whatever app is their default). Per user (HKCU), so no
; admin rights. On Windows 11 these show under "Show more options" (Shift+F10); the compact menu
; only lists packaged apps.

!macro SLATE_VIEWER_VERB KEY ARG
  WriteRegStr HKCU "Software\Classes\${KEY}\shell\SlateViewer" "" "Open in Slate Viewer"
  WriteRegStr HKCU "Software\Classes\${KEY}\shell\SlateViewer" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\${KEY}\shell\SlateViewer\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "${ARG}"'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro SLATE_VIEWER_VERB "Directory" "%1"
  !insertmacro SLATE_VIEWER_VERB "Directory\Background" "%V"
  !insertmacro SLATE_VIEWER_VERB "SystemFileAssociations\.md" "%1"
  !insertmacro SLATE_VIEWER_VERB "SystemFileAssociations\.markdown" "%1"
  WriteRegStr HKCU "Software\SlateViewer\Capabilities" "ApplicationName" "Slate Viewer"
  WriteRegStr HKCU "Software\SlateViewer\Capabilities" "ApplicationDescription" "Markdown viewer and editor"
  WriteRegStr HKCU "Software\SlateViewer\Capabilities" "ApplicationIcon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\SlateViewer\Capabilities\FileAssociations" ".md" "SlateViewer.Markdown"
  WriteRegStr HKCU "Software\SlateViewer\Capabilities\FileAssociations" ".markdown" "SlateViewer.Markdown"
  WriteRegStr HKCU "Software\RegisteredApplications" "SlateViewer" "Software\SlateViewer\Capabilities"
  ; Tell Explorer the associations changed (SHCNE_ASSOCCHANGED).
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\SlateViewer"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\SlateViewer"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.md\shell\SlateViewer"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\SlateViewer"
  DeleteRegValue HKCU "Software\RegisteredApplications" "SlateViewer"
  DeleteRegKey HKCU "Software\SlateViewer"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
