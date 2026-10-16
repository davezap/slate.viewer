; Extra installer steps (bundle.windows.nsis.installerHooks in tauri.conf.json).
;
; Tauri's installer already adds .md / .markdown to "Open with" (ProgID SlateViewer.Markdown).
; These steps also register Slate Viewer as a default-app candidate, so it is listed under
; Settings > Apps > Default apps and File > "Make Slate Viewer the Default for .md Files" can
; open its page there. Windows only lets the user pick the default; no app can set it itself.

!macro NSIS_HOOK_POSTINSTALL
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
  DeleteRegValue HKCU "Software\RegisteredApplications" "SlateViewer"
  DeleteRegKey HKCU "Software\SlateViewer"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
