// One list of plugins, shared by the main process (shortcuts), the island (Apps tab) and the hub window.
// kind: "action" runs instantly, "toggle" flips a mode, "window" opens in the hub window.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CATALOG = factory();
})(this, function () {
  return [
    { id: 'textExtract', name: 'Text extractor', group: 'Screen', kind: 'action', key: 'Ctrl+Alt+T', desc: 'Drag over any text on screen and it is copied to the clipboard.' },
    { id: 'lens', name: 'Lens search', group: 'Screen', kind: 'action', key: 'Ctrl+Alt+L', desc: 'Select part of the screen and search for the object or similar images.' },
    { id: 'colorPicker', name: 'Color picker', group: 'Screen', kind: 'action', key: 'Ctrl+Alt+C', desc: 'Pick any pixel on screen and copy its color.' },
    { id: 'draw', name: 'Draw on screen', group: 'Screen', kind: 'action', key: 'Ctrl+Alt+D', desc: 'Annotate your screen. Esc clears everything.' },
    { id: 'translate', name: 'Translate', group: 'Screen', kind: 'window', key: 'Ctrl+Alt+R', desc: 'Scan text on screen or type it, then read the translation.' },

    { id: 'todo', name: 'Tasks', group: 'Productivity', kind: 'window', key: 'Ctrl+Alt+N', desc: 'A simple to-do list.' },
    { id: 'calendar', name: 'Calendar', group: 'Productivity', kind: 'window', key: 'Ctrl+Alt+E', desc: 'Month view with events.' },
    { id: 'calc', name: 'Calculator', group: 'Productivity', kind: 'window', key: 'Ctrl+Alt+U', desc: 'Calculator and unit converter.' },
    { id: 'weather', name: 'Weather', group: 'Productivity', kind: 'window', key: 'Ctrl+Alt+W', desc: 'Current weather and a 5 day forecast.' },
    { id: 'voice', name: 'Voice memos', group: 'Productivity', kind: 'window', key: 'Ctrl+Alt+M', desc: 'Record, play back and export audio notes.' },
    { id: 'qr', name: 'QR code', group: 'Productivity', kind: 'window', key: 'Ctrl+Alt+Q', desc: 'Make styled QR codes with a live preview.' },
    { id: 'coffee', name: 'Coffee mode', group: 'Productivity', kind: 'toggle', key: 'Ctrl+Alt+K', desc: 'Keeps the screen awake while it is on.' },

    { id: 'convert', name: 'File converter', group: 'Files', kind: 'window', key: 'Ctrl+Alt+F', desc: 'Convert images, audio, video and documents within the same family.' },
    { id: 'compress', name: 'File size reducer', group: 'Files', kind: 'window', key: 'Ctrl+Alt+Z', desc: 'Shrink images, video, audio, PDFs and other files.' },
    { id: 'print', name: 'Print', group: 'Files', kind: 'window', key: 'Ctrl+Alt+P', desc: 'Preview and print PDFs, images and documents.' },
    { id: 'cleaner', name: 'Temp cleaner', group: 'Files', kind: 'window', key: 'Ctrl+Alt+X', desc: 'Remove temporary files and caches.' },
    { id: 'youtube', name: 'YouTube downloader', group: 'Files', kind: 'window', key: 'Ctrl+Alt+Y', desc: 'Download a video or audio, optionally a trimmed segment.' },

    { id: 'speed', name: 'Speed test', group: 'Network', kind: 'window', key: 'Ctrl+Alt+S', desc: 'Measure ping, download and upload speed.' },
    { id: 'share', name: 'QuickShare', group: 'Network', kind: 'window', key: 'Ctrl+Alt+H', desc: 'Send files to or receive files from your phone over Wi-Fi.' },
    { id: 'sysinfo', name: 'System monitor', group: 'System', kind: 'window', key: 'Ctrl+Alt+I', desc: 'CPU, memory, disks and device details.' },
    { id: 'shortcuts', name: 'Shortcuts', group: 'System', kind: 'window', key: '', desc: 'Set a keyboard shortcut for every plugin.' },
  ];
});
